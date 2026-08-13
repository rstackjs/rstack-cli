/* rslint-disable @typescript-eslint/no-unsafe-assignment -- Rstest asymmetric matchers are intentionally untyped. */
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LintResult, RslintOptions } from '@rslint/core';
import { beforeEach, expect, test } from '@rstest/core';
import { captureLintSnapshot, getLintFixPreview, listDiagnostics } from '../src/lint.ts';
import { contextStoreSchemaVersion, type ContextRunManifest } from '../src/model.ts';
import { readProjectStatus } from '../src/status.ts';
import {
  readContextSnapshotById,
  readContextSnapshots,
  writeContextRunManifest,
  writeContextSnapshot,
} from '../src/store.ts';

const mocks = {
  closeCalls: 0,
  lintFilesCalls: [] as Array<string | string[]>,
  lintTextCalls: [] as Array<[string, { filePath?: string } | undefined]>,
  options: [] as RslintOptions[],
  results: [] as LintResult[],
  lintError: undefined as Error | undefined,
};

const createRslint = (options: RslintOptions) => {
  mocks.options.push(options);
  return {
    lintFiles(patterns: string | string[]): Promise<LintResult[]> {
      mocks.lintFilesCalls.push(patterns);
      return mocks.lintError === undefined
        ? Promise.resolve(mocks.results)
        : Promise.reject(mocks.lintError);
    },

    lintText(code: string, options?: { filePath?: string }): Promise<LintResult[]> {
      mocks.lintTextCalls.push([code, options]);
      return mocks.lintError === undefined
        ? Promise.resolve(mocks.results)
        : Promise.reject(mocks.lintError);
    },

    close(): Promise<void> {
      mocks.closeCalls += 1;
      return Promise.resolve();
    },
  };
};

beforeEach(() => {
  mocks.closeCalls = 0;
  mocks.lintFilesCalls.length = 0;
  mocks.lintTextCalls.length = 0;
  mocks.options.length = 0;
  mocks.results = [];
  mocks.lintError = undefined;
});

const withTempWorkspace = async (
  callback: (workspaceRoot: string) => Promise<void>,
): Promise<void> => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-context-lint-'));
  try {
    await callback(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
};

test('loading lint queries does not load the Rslint runtime', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const markerFile = path.join(workspaceRoot, 'rslint-loaded');
    const hookFile = path.join(workspaceRoot, 'import-hook.mjs');
    await writeFile(
      hookFile,
      `import { writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@rslint/core') {
      writeFileSync(process.env.RSTACK_RSLINT_LOADED_MARKER, 'loaded');
    }
    return nextResolve(specifier, context);
  },
});
`,
    );
    const moduleUrl = pathToFileURL(path.resolve('src/lint.ts')).toString();
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        pathToFileURL(hookFile).href,
        '--input-type=module',
        '--eval',
        `const { listDiagnostics } = await import(${JSON.stringify(moduleUrl)});
await listDiagnostics(${JSON.stringify(workspaceRoot)}).catch(() => undefined);`,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, RSTACK_RSLINT_LOADED_MARKER: markerFile },
      },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    await expect(
      import('node:fs/promises').then(({ access }) => access(markerFile)),
    ).rejects.toThrow();
  });
});

test('captures a deterministic file snapshot with complete inputs and fail status', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const aPath = path.join(workspaceRoot, 'a.ts');
    const bPath = path.join(workspaceRoot, 'b.ts');
    await writeFile(aPath, 'const a = 1;\n');
    await writeFile(bPath, 'const b = 2;\n');
    mocks.results = [
      {
        filePath: bPath,
        errorCount: 1,
        warningCount: 0,
        fixableErrorCount: 1,
        fixableWarningCount: 0,
        messages: [
          {
            ruleId: 'z-rule',
            severity: 2,
            message: 'later',
            line: 3,
            column: 1,
          },
          {
            ruleId: 'a-rule',
            severity: 2,
            message: 'first',
            line: 1,
            column: 2,
            fix: { range: [0, 1], text: 'x' },
          },
        ],
      },
      {
        filePath: aPath,
        errorCount: 0,
        warningCount: 1,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        messages: [
          {
            ruleId: null,
            severity: 1,
            message: 'warning',
            line: 1,
            column: 1,
          },
        ],
      },
    ];

    const result = await captureLintSnapshot(workspaceRoot, { mode: 'files' }, createRslint);
    const stored = await readContextSnapshotById(workspaceRoot, result.snapshotId);
    const status = await readProjectStatus(workspaceRoot);

    expect(mocks.options).toEqual([
      {
        cwd: workspaceRoot,
        fix: false,
        overrideConfigFile: expect.stringMatching(/[\\/]rslintConfig\.js$/u),
      },
    ]);
    expect(mocks.lintFilesCalls).toEqual([['.']]);
    expect(mocks.closeCalls).toBe(1);
    expect(result).toMatchObject({
      status: 'fail',
      freshness: { state: 'fresh', changedPaths: [] },
      summary: {
        files: 2,
        errors: 1,
        warnings: 1,
        fixableErrors: 1,
        fixableWarnings: 0,
      },
    });
    expect(stored?.snapshot.source).toMatchObject({
      captureSelection: { mode: 'files', patterns: ['.'] },
      inputCompleteness: 'complete',
      inputs: [{ path: 'a.ts' }, { path: 'b.ts' }],
    });
    expect(stored?.snapshot.facets.lint).toMatchObject({
      producer: 'rslint',
      mode: 'files',
      fixPreviewCaptured: false,
      files: [
        { path: 'a.ts', messages: [{ message: 'warning' }] },
        {
          path: 'b.ts',
          messages: [{ message: 'first' }, { message: 'later' }],
        },
      ],
    });
    expect(status.contexts[0]?.context).toEqual({
      contextId: result.contextId,
      packageRoot: '.',
      product: 'development',
      environment: 'lint',
    });
  });
});

test('captures text without persisting the input and exposes only stored fix output', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const code = 'let value = 1;\n';
    mocks.results = [
      {
        filePath: path.join(workspaceRoot, 'src', 'buffer.ts'),
        errorCount: 0,
        warningCount: 1,
        fixableErrorCount: 0,
        fixableWarningCount: 1,
        messages: [
          {
            ruleId: 'prefer-const',
            severity: 1,
            message: 'Use const.',
            line: 1,
            column: 1,
          },
        ],
        output: 'const value = 1;\n',
      },
    ];

    const result = await captureLintSnapshot(
      workspaceRoot,
      {
        mode: 'text',
        code,
        filePath: 'src/buffer.ts',
        includeFixPreview: true,
      },
      createRslint,
    );
    const stored = await readContextSnapshotById(workspaceRoot, result.snapshotId);

    expect(mocks.options[0]).toMatchObject({ cwd: workspaceRoot, fix: true });
    expect(mocks.lintTextCalls).toEqual([[code, { filePath: 'src/buffer.ts' }]]);
    expect(result.status).toBe('pass');
    expect(result.freshness).toEqual({ state: 'unknown', changedPaths: [] });
    expect(stored?.snapshot.source).toEqual({
      captureSelection: { mode: 'text', filePath: 'src/buffer.ts' },
      virtualInputDigest: 'cb9ebc2725b5316484859fdf300212c224086174b0e6e64e16cd2a7f65c90829',
    });
    expect(JSON.stringify(stored)).not.toContain(code);
    await expect(
      getLintFixPreview(workspaceRoot, result.snapshotId, 'src/buffer.ts'),
    ).resolves.toEqual({
      available: true,
      snapshotId: result.snapshotId,
      path: 'src/buffer.ts',
      beforeDigest: 'cb9ebc2725b5316484859fdf300212c224086174b0e6e64e16cd2a7f65c90829',
      fixedOutput: 'const value = 1;\n',
    });
  });
});

test('paginates and filters diagnostics from one frozen snapshot deterministically', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const aPath = path.join(workspaceRoot, 'src', 'a.ts');
    const bPath = path.join(workspaceRoot, 'src', 'b.ts');
    await mkdir(path.dirname(aPath), { recursive: true });
    await writeFile(aPath, 'a');
    await writeFile(bPath, 'b');
    mocks.results = [
      {
        filePath: bPath,
        errorCount: 1,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        messages: [{ ruleId: 'b', severity: 2, message: 'b', line: 2, column: 1 }],
      },
      {
        filePath: aPath,
        errorCount: 1,
        warningCount: 1,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        messages: [
          { ruleId: 'a', severity: 1, message: 'warning', line: 2, column: 1 },
          { ruleId: 'a', severity: 2, message: 'error', line: 1, column: 1 },
        ],
      },
    ];
    const capture = await captureLintSnapshot(
      workspaceRoot,
      {
        mode: 'files',
        patterns: ['src/**/*.ts'],
      },
      createRslint,
    );

    const first = await listDiagnostics(workspaceRoot, {
      snapshotId: capture.snapshotId,
      severity: 'error',
      pathPrefix: 'src/',
      limit: 1,
    });
    expect(first).toMatchObject({
      snapshotId: capture.snapshotId,
      freshness: { state: 'fresh', changedPaths: [] },
      total: 2,
      items: [{ path: 'src/a.ts', ruleId: 'a', severity: 'error', message: 'error' }],
    });
    expect(first.nextCursor).toEqual(expect.any(String));
    await expect(
      listDiagnostics(workspaceRoot, {
        snapshotId: capture.snapshotId,
        severity: 'error',
        pathPrefix: 'src/',
        limit: 1,
        cursor: first.nextCursor,
      }),
    ).resolves.toMatchObject({
      snapshotId: capture.snapshotId,
      total: 2,
      items: [{ path: 'src/b.ts', ruleId: 'b', severity: 'error', message: 'b' }],
    });
  });
});

test('reports only terminal test failures as current diagnostics', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const context = {
      contextId: 'ctx_test',
      packageRoot: '.',
      product: 'development',
    } as const;
    const run = {
      schemaVersion: contextStoreSchemaVersion,
      runId: 'run_test_diagnostics',
      producer: 'rstest',
      command: 'test',
      startedAt: '2026-08-12T08:00:00.000Z',
      contexts: [context],
    } satisfies ContextRunManifest;
    await writeContextRunManifest(workspaceRoot, run);
    await writeContextSnapshot(workspaceRoot, {
      schemaVersion: contextStoreSchemaVersion,
      snapshotId: 'snap_test_diagnostics',
      runId: run.runId,
      contextId: context.contextId,
      sequence: 0,
      observedAt: '2026-08-12T08:00:01.000Z',
      status: 'fail',
      completeness: { test: 'complete' },
      facets: {
        test: {
          producer: 'rstest',
          files: [
            {
              project: 'unit',
              path: 'src/recovered.test.ts',
              status: 'pass',
              tests: [
                {
                  project: 'unit',
                  path: 'src/recovered.test.ts',
                  name: 'recovers',
                  status: 'pass',
                  retryErrors: [{ name: 'AssertionError', message: 'recovered attempt' }],
                  retryCount: 1,
                },
              ],
            },
            {
              project: 'unit',
              path: 'src/failing.test.ts',
              status: 'fail',
              errors: [{ name: 'Error', message: 'file import failed' }],
              tests: [
                {
                  project: 'unit',
                  path: 'src/failing.test.ts',
                  parentNames: ['suite'],
                  name: 'fails',
                  status: 'fail',
                  errors: [{ name: 'AssertionError', message: 'terminal failure' }],
                  retryErrors: [{ name: 'AssertionError', message: 'earlier attempt' }],
                  retryCount: 1,
                },
              ],
            },
          ],
          stats: {
            tests: { total: 2, passed: 1, failed: 1, skipped: 0, todo: 0 },
            files: { total: 2, failed: 1 },
          },
          durationMs: 3,
          unhandledErrors: [],
        },
      },
    });

    await expect(
      listDiagnostics(workspaceRoot, { snapshotId: 'snap_test_diagnostics' }),
    ).resolves.toMatchObject({
      total: 2,
      items: [
        {
          producer: 'rstest',
          path: 'src/failing.test.ts',
          project: 'unit',
          message: 'file import failed',
        },
        {
          producer: 'rstest',
          path: 'src/failing.test.ts',
          project: 'unit',
          name: 'suite > fails',
          message: 'terminal failure',
        },
      ],
    });
  });
});

test('selects the newest diagnostic snapshot rather than an unrelated newer build', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const filePath = path.join(workspaceRoot, 'a.ts');
    await writeFile(filePath, 'a');
    mocks.results = [
      {
        filePath,
        errorCount: 1,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        messages: [{ ruleId: 'a', severity: 2, message: 'error', line: 1, column: 1 }],
      },
    ];
    const lintCapture = await captureLintSnapshot(workspaceRoot, { mode: 'files' }, createRslint);
    const context = { contextId: 'ctx_build', packageRoot: '.', product: 'application' } as const;
    const run = {
      schemaVersion: contextStoreSchemaVersion,
      runId: 'run_newer_build',
      producer: 'rsbuild',
      command: 'build',
      startedAt: '9999-01-01T00:00:00.000Z',
      contexts: [context],
    } satisfies ContextRunManifest;
    await writeContextRunManifest(workspaceRoot, run);
    await writeContextSnapshot(workspaceRoot, {
      schemaVersion: contextStoreSchemaVersion,
      snapshotId: 'snap_newer_build',
      runId: run.runId,
      contextId: context.contextId,
      sequence: 0,
      observedAt: '9999-01-01T00:00:00.000Z',
      status: 'pass',
      completeness: { build: 'complete' },
      facets: {},
    });

    await expect(listDiagnostics(workspaceRoot)).resolves.toMatchObject({
      snapshotId: lintCapture.snapshotId,
      total: 1,
    });
  });
});

test('rejects a malformed diagnostics cursor', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const filePath = path.join(workspaceRoot, 'a.ts');
    await writeFile(filePath, 'a');
    mocks.results = [
      {
        filePath,
        errorCount: 0,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        messages: [],
      },
    ];
    const capture = await captureLintSnapshot(workspaceRoot, { mode: 'files' }, createRslint);

    await expect(
      listDiagnostics(workspaceRoot, { snapshotId: capture.snapshotId, cursor: '?' }),
    ).rejects.toThrow('Invalid diagnostics cursor');
  });
});

test('returns snapshot provenance for an empty diagnostics page', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const filePath = path.join(workspaceRoot, 'a.ts');
    await writeFile(filePath, 'a');
    mocks.results = [
      {
        filePath,
        errorCount: 0,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        messages: [],
      },
    ];
    const capture = await captureLintSnapshot(workspaceRoot, { mode: 'files' }, createRslint);
    const stored = await readContextSnapshotById(workspaceRoot, capture.snapshotId);

    await expect(
      listDiagnostics(workspaceRoot, { snapshotId: capture.snapshotId }),
    ).resolves.toMatchObject({
      snapshotId: capture.snapshotId,
      producer: 'rslint',
      contextId: capture.contextId,
      observedAt: stored?.snapshot.observedAt,
      completeness: { lint: 'complete' },
      freshness: { state: 'fresh', changedPaths: [] },
      total: 0,
      items: [],
    });
  });
});

test('reports preview availability without rerunning or applying Rslint', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const filePath = path.join(workspaceRoot, 'a.ts');
    await writeFile(filePath, 'const a = 1;\n');
    mocks.results = [
      {
        filePath,
        errorCount: 0,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        messages: [],
        output: 'const a = 1;\n',
      },
    ];

    const notCaptured = await captureLintSnapshot(
      workspaceRoot,
      {
        mode: 'files',
      },
      createRslint,
    );
    await expect(getLintFixPreview(workspaceRoot, notCaptured.snapshotId, 'a.ts')).resolves.toEqual(
      {
        available: false,
        reason: 'not-captured',
        snapshotId: notCaptured.snapshotId,
        path: 'a.ts',
      },
    );

    const noChange = await captureLintSnapshot(
      workspaceRoot,
      {
        mode: 'files',
        includeFixPreview: true,
      },
      createRslint,
    );
    await expect(getLintFixPreview(workspaceRoot, noChange.snapshotId, 'a.ts')).resolves.toEqual({
      available: false,
      reason: 'no-change',
      snapshotId: noChange.snapshotId,
      path: 'a.ts',
    });
    expect(mocks.lintFilesCalls).toHaveLength(2);
  });
});

test('persists a partial diagnostic snapshot and closes the engine when linting throws', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const lintError = new Error('lint failed');
    mocks.lintError = lintError;

    await expect(captureLintSnapshot(workspaceRoot, { mode: 'files' }, createRslint)).rejects.toBe(
      lintError,
    );
    expect(mocks.options).toHaveLength(1);
    expect(mocks.closeCalls).toBe(1);

    const [stored] = await readContextSnapshots(workspaceRoot, {
      producer: 'rslint',
    });
    expect(stored?.snapshot).toMatchObject({
      status: 'error',
      completeness: { lint: 'partial' },
      facets: {
        lint: {
          producer: 'rslint',
          mode: 'files',
          files: [
            {
              errorCount: 1,
              messages: [{ ruleId: null, severity: 2, message: 'lint failed' }],
            },
          ],
          totals: {
            files: 1,
            errors: 1,
            warnings: 0,
            fixableErrors: 0,
            fixableWarnings: 0,
          },
        },
      },
      source: { inputs: [], inputCompleteness: 'partial' },
    });
    await expect(
      listDiagnostics(workspaceRoot, {
        snapshotId: stored?.snapshot.snapshotId,
      }),
    ).resolves.toMatchObject({
      producer: 'rslint',
      contextId: stored?.snapshot.contextId,
      completeness: { lint: 'partial' },
      total: 1,
      items: [{ producer: 'rslint', severity: 'error', message: 'lint failed' }],
    });
  });
});

test('persists a partial diagnostic snapshot when creating the lint engine throws', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const factoryError = new Error('Rslint configuration failed');

    await expect(
      captureLintSnapshot(workspaceRoot, { mode: 'files' }, () => {
        throw factoryError;
      }),
    ).rejects.toBe(factoryError);

    const [stored] = await readContextSnapshots(workspaceRoot, {
      producer: 'rslint',
    });
    expect(stored?.snapshot).toMatchObject({
      status: 'error',
      completeness: { lint: 'partial' },
      facets: {
        lint: {
          totals: { files: 1, errors: 1 },
          files: [{ messages: [{ message: 'Rslint configuration failed' }] }],
        },
      },
    });
    expect(mocks.closeCalls).toBe(0);
  });
});
