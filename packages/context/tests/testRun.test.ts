import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestRunResult } from '@rstest/core/api';
import { expect, test } from '@rstest/core';
import { listDiagnostics } from '../src/lint.ts';
import { readProjectStatus } from '../src/status.ts';
import { readContextSnapshotById } from '../src/store.ts';
import {
  captureTestSnapshot,
  listTestResults,
  type TestCaptureDependencies,
  type TestSnapshotRequest,
} from '../src/testRun.ts';

const withTempWorkspace = async (
  callback: (workspaceRoot: string) => Promise<void>,
): Promise<void> => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-context-test-run-'));

  try {
    await callback(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
};

const createResult = (overrides: Partial<TestRunResult> = {}): TestRunResult => ({
  ok: true,
  files: [],
  stats: {
    tests: { total: 0, passed: 0, failed: 0, skipped: 0, todo: 0 },
    files: { total: 0, failed: 0 },
  },
  unhandledErrors: [],
  duration: { total: 0 },
  ...overrides,
});

const createDependencies = (
  result: TestRunResult,
  calls: unknown[],
  suffix: string,
): TestCaptureDependencies => ({
  runRstest: async (options) => {
    calls.push(options);
    return result;
  },
  createRunId: () => `run_${suffix}`,
  createSnapshotId: () => `snap_${suffix}`,
  now: () => new Date('2026-08-12T08:00:00.000Z'),
});

test('publishes the Istanbul provider as an exact required peer', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  };

  expect(packageJson.dependencies?.['@rstest/coverage-istanbul']).toBeUndefined();
  expect(packageJson.devDependencies?.['@rstest/coverage-istanbul']).toBe('catalog:');
  expect(packageJson.peerDependencies?.['@rstest/coverage-istanbul']).toBe('0.11.6');
  expect(packageJson.peerDependenciesMeta?.['@rstest/coverage-istanbul']).toBeUndefined();
});

test('captures one passing run with partial source freshness', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const testPath = path.join(workspaceRoot, 'src', 'math.test.ts');
    await mkdir(path.dirname(testPath), { recursive: true });
    await writeFile(testPath, 'test');
    const calls: unknown[] = [];
    const result = createResult({
      files: [
        {
          project: 'default',
          testPath,
          name: 'math.test.ts',
          status: 'pass',
          duration: 12,
          results: [
            {
              project: 'default',
              testPath,
              name: 'adds',
              parentNames: ['math'],
              status: 'pass',
              duration: 4,
            },
          ],
        },
      ],
      stats: {
        tests: { total: 1, passed: 1, failed: 0, skipped: 0, todo: 0 },
        files: { total: 1, failed: 0 },
      },
      duration: { total: 18 },
    });

    await expect(
      captureTestSnapshot(
        workspaceRoot,
        { files: ['src/math.test.ts'], testNamePattern: 'adds' },
        createDependencies(result, calls, 'pass'),
      ),
    ).resolves.toEqual({
      runId: 'run_pass',
      contextId: expect.stringMatching(/^ctx_[0-9a-f]{24}$/u),
      snapshotId: 'snap_pass',
      status: 'pass',
      freshness: { state: 'partial', changedPaths: [] },
      summary: {
        files: 1,
        failedFiles: 0,
        tests: 1,
        failedTests: 0,
        unhandledErrors: 0,
      },
    });
    expect(calls).toEqual([
      {
        cwd: workspaceRoot,
        config: expect.stringMatching(/rstestConfig\.js$/u),
        files: ['src/math.test.ts'],
        testNamePattern: 'adds',
      },
    ]);

    const stored = await readContextSnapshotById(workspaceRoot, 'snap_pass');
    const status = await readProjectStatus(workspaceRoot);
    expect(stored?.snapshot.facets.execution).toBeUndefined();
    expect(stored?.snapshot).toMatchObject({
      status: 'pass',
      completeness: { test: 'complete' },
      source: {
        inputCompleteness: 'partial',
        inputs: [
          {
            path: 'src/math.test.ts',
            digest: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
          },
        ],
      },
      facets: {
        test: {
          producer: 'rstest',
          durationMs: 18,
          unhandledErrors: [],
          files: [
            {
              project: 'default',
              path: 'src/math.test.ts',
              status: 'pass',
              durationMs: 12,
              tests: [
                {
                  project: 'default',
                  path: 'src/math.test.ts',
                  name: 'adds',
                  parentNames: ['math'],
                  status: 'pass',
                  durationMs: 4,
                },
              ],
            },
          ],
        },
      },
    });
    expect(status.contexts[0]?.context).toEqual({
      contextId: expect.stringMatching(/^ctx_[0-9a-f]{24}$/u),
      packageRoot: '.',
      product: 'development',
      environment: 'test',
    });

    await expect(listTestResults(workspaceRoot, {})).resolves.toMatchObject({
      snapshotId: 'snap_pass',
      freshness: { state: 'partial', changedPaths: [] },
      total: 1,
      items: [{ project: 'default', path: 'src/math.test.ts', name: 'adds' }],
    });
    await unlink(testPath);
    await expect(listTestResults(workspaceRoot, {})).resolves.toMatchObject({
      snapshotId: 'snap_pass',
      freshness: { state: 'stale', changedPaths: ['src/math.test.ts'] },
    });
  });
});

test('captures requested aggregate Istanbul execution evidence', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const testPath = path.join(workspaceRoot, 'src', 'math.test.ts');
    const sourcePath = path.join(workspaceRoot, 'src', 'math.ts');
    const classPath = path.join(workspaceRoot, 'src', 'counter.ts');
    await mkdir(path.dirname(testPath), { recursive: true });
    await writeFile(testPath, 'test');
    await writeFile(sourcePath, 'export const add = (a, b) => a + b;');
    await writeFile(classPath, 'export class Counter {}');
    const calls: unknown[] = [];
    const coverage = {
      [sourcePath]: {
        path: sourcePath,
        statementMap: {
          '1': { start: { line: 2, column: 0 }, end: { line: 2, column: 12 } },
          '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 36 } },
        },
        fnMap: {
          '0': {
            name: 'add',
            decl: {
              start: { line: 1, column: 13 },
              end: { line: 1, column: 16 },
            },
            loc: {
              start: { line: 1, column: 19 },
              end: { line: 1, column: 36 },
            },
          },
        },
        branchMap: {
          '0': {
            type: 'binary-expr',
            loc: {
              start: { line: 1, column: 27 },
              end: { line: 1, column: 32 },
            },
            locations: [
              { start: { line: 1, column: 27 }, end: { line: 1, column: 28 } },
              { start: { line: 1, column: 31 }, end: { line: 1, column: 32 } },
            ],
          },
        },
        s: { '0': 2, '1': 0 },
        f: { '0': 2 },
        b: { '0': [2, 0] },
      },
      [classPath]: {
        data: {
          path: classPath,
          statementMap: {
            '0': {
              start: { line: 1, column: 0 },
              end: { line: 1, column: 23 },
            },
          },
          fnMap: {},
          branchMap: {},
          s: { '0': 1 },
          f: {},
          b: {},
        },
      },
    } as unknown as NonNullable<TestRunResult['coverage']>;
    const result = createResult({
      coverage,
      files: [
        {
          project: 'default',
          testPath,
          name: 'math.test.ts',
          status: 'pass',
          results: [],
        },
      ],
    });

    const capture = await captureTestSnapshot(
      workspaceRoot,
      {
        execution: {
          include: ['src/**/*.ts'],
          exclude: ['src/**/*.test.ts'],
          allowExternal: true,
        },
      },
      createDependencies(result, calls, 'execution'),
    );

    expect(calls).toEqual([
      {
        cwd: workspaceRoot,
        config: expect.stringMatching(/rstestConfig\.js$/u),
        inlineConfig: {
          coverage: {
            enabled: true,
            provider: 'istanbul',
            reporters: [],
            reportOnFailure: true,
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts'],
            allowExternal: true,
          },
        },
      },
    ]);
    const stored = await readContextSnapshotById(workspaceRoot, capture.snapshotId);
    expect(stored?.snapshot.completeness).toEqual({
      test: 'complete',
      execution: 'complete',
    });
    expect(stored?.snapshot.facets.execution).toEqual({
      producer: 'rstest',
      provider: 'istanbul',
      availability: 'available',
      requestedSelection: {
        include: ['src/**/*.ts'],
        exclude: ['src/**/*.test.ts'],
        allowExternal: true,
      },
      digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      universe: {
        reportedFiles: 2,
        storedFiles: 2,
        droppedFiles: 0,
        reportedLocations: 8,
        storedLocations: 8,
        droppedLocations: 0,
        completeness: 'complete',
      },
      truncated: { files: 0, locations: 0 },
      bounds: {
        attribution: 'aggregate-run-only',
        testAttribution: false,
        maxFiles: 1000,
        maxLocationsPerFile: 20_000,
        maxLocationsTotal: 100_000,
      },
      files: [
        {
          path: 'src/counter.ts',
          digest: '56487e6af58165f47f737975f5cef61ad6dfc7c0c59af4807dcdf993d931570a',
          statements: [
            {
              id: '0',
              location: {
                start: { line: 1, column: 0 },
                end: { line: 1, column: 23 },
              },
              hits: 1,
            },
          ],
          functions: [],
          branches: [],
        },
        {
          path: 'src/math.ts',
          digest: '5040544f09224c8ba67da55ac47c01b1d1ab917a8d07c0a42f00cf14c570f5a9',
          statements: [
            {
              id: '0',
              location: {
                start: { line: 1, column: 0 },
                end: { line: 1, column: 36 },
              },
              hits: 2,
            },
            {
              id: '1',
              location: {
                start: { line: 2, column: 0 },
                end: { line: 2, column: 12 },
              },
              hits: 0,
            },
          ],
          functions: [
            {
              id: '0',
              name: 'add',
              declaration: {
                start: { line: 1, column: 13 },
                end: { line: 1, column: 16 },
              },
              location: {
                start: { line: 1, column: 19 },
                end: { line: 1, column: 36 },
              },
              hits: 2,
            },
          ],
          branches: [
            {
              id: '0',
              type: 'binary-expr',
              location: {
                start: { line: 1, column: 27 },
                end: { line: 1, column: 32 },
              },
              arms: [
                {
                  location: {
                    start: { line: 1, column: 27 },
                    end: { line: 1, column: 28 },
                  },
                  hits: 2,
                },
                {
                  location: {
                    start: { line: 1, column: 31 },
                    end: { line: 1, column: 32 },
                  },
                  hits: 0,
                },
              ],
            },
          ],
        },
      ],
    });
    expect(stored?.snapshot.source?.inputs?.map((input) => input.path)).toEqual([
      'src/counter.ts',
      'src/math.test.ts',
      'src/math.ts',
    ]);
  });
});

test('records requested execution as unavailable when Rstest returns no coverage map', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const calls: unknown[] = [];
    const capture = await captureTestSnapshot(
      workspaceRoot,
      { execution: {} },
      createDependencies(createResult(), calls, 'execution-unavailable'),
    );

    expect(calls).toEqual([
      {
        cwd: workspaceRoot,
        config: expect.stringMatching(/rstestConfig\.js$/u),
        inlineConfig: {
          coverage: {
            enabled: true,
            provider: 'istanbul',
            reporters: [],
            reportOnFailure: true,
            allowExternal: false,
          },
        },
      },
    ]);
    await expect(readContextSnapshotById(workspaceRoot, capture.snapshotId)).resolves.toMatchObject(
      {
        snapshot: {
          completeness: { test: 'complete', execution: 'partial' },
          facets: {
            execution: {
              producer: 'rstest',
              provider: 'istanbul',
              availability: 'unavailable',
              requestedSelection: { allowExternal: false },
              digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
              universe: {
                reportedFiles: 0,
                storedFiles: 0,
                droppedFiles: 0,
                reportedLocations: 0,
                storedLocations: 0,
                droppedLocations: 0,
                completeness: 'unknown',
              },
              truncated: { files: 0, locations: 0 },
              bounds: {
                attribution: 'aggregate-run-only',
                testAttribution: false,
              },
              files: [],
            },
          },
        },
      },
    );
  });
});

test('persists partial execution evidence when a covered source path is unreadable', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const testPath = path.join(workspaceRoot, 'src', 'present.test.ts');
    const missingPath = path.join(workspaceRoot, 'src', 'missing.ts');
    await mkdir(path.dirname(testPath), { recursive: true });
    await writeFile(testPath, 'test');
    const coverage = {
      [missingPath]: {
        path: missingPath,
        statementMap: {
          '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
        },
        fnMap: {},
        branchMap: {},
        s: { '0': 1 },
        f: {},
        b: {},
      },
    } as unknown as NonNullable<TestRunResult['coverage']>;
    const result = createResult({
      files: [
        {
          project: 'default',
          testPath,
          name: 'present.test.ts',
          status: 'pass',
          results: [],
        },
      ],
      coverage,
    });
    const calls: unknown[] = [];

    const capture = await captureTestSnapshot(
      workspaceRoot,
      { execution: {} },
      createDependencies(result, calls, 'execution-unreadable'),
    );
    const stored = await readContextSnapshotById(workspaceRoot, capture.snapshotId);

    expect(stored?.snapshot.completeness).toEqual({ test: 'complete', execution: 'partial' });
    expect(stored?.snapshot.source).toEqual({
      inputCompleteness: 'partial',
      inputs: [
        {
          path: 'src/present.test.ts',
          digest: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        },
      ],
    });
    expect(stored?.snapshot.facets.execution).toMatchObject({
      availability: 'available',
      universe: { completeness: 'partial' },
      files: [
        {
          path: 'src/missing.ts',
          statements: [{ id: '0', hits: 1 }],
        },
      ],
    });
    expect(
      (stored?.snapshot.facets.execution as { files: Array<{ digest?: string }> }).files[0]?.digest,
    ).toBeUndefined();
  });
});

test('bounds requested execution selectors before invoking Rstest', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    let called = false;
    const dependencies: TestCaptureDependencies = {
      runRstest: async () => {
        called = true;
        return createResult();
      },
    };

    await expect(
      captureTestSnapshot(
        workspaceRoot,
        {
          execution: {
            include: Array.from({ length: 201 }, (_, index) => `${index}.ts`),
          },
        },
        dependencies,
      ),
    ).rejects.toThrow('Execution include must contain at most 200 patterns.');
    expect(called).toBe(false);
  });
});

test('rejects malformed execution selectors before invoking Rstest', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    let called = false;
    const dependencies: TestCaptureDependencies = {
      runRstest: async () => {
        called = true;
        return createResult();
      },
    };

    await expect(
      captureTestSnapshot(
        workspaceRoot,
        { execution: { include: 'src/**/*.ts' as unknown as string[] } },
        dependencies,
      ),
    ).rejects.toThrow('Execution include must be an array of string patterns.');
    await expect(
      captureTestSnapshot(
        workspaceRoot,
        { execution: { exclude: [42] as unknown as string[] } },
        dependencies,
      ),
    ).rejects.toThrow('Execution exclude must be an array of string patterns.');
    await expect(
      captureTestSnapshot(
        workspaceRoot,
        { execution: { allowExternal: 'yes' as unknown as boolean } },
        dependencies,
      ),
    ).rejects.toThrow('Execution allowExternal must be a boolean.');
    expect(called).toBe(false);
  });
});

test('truncates aggregate execution files deterministically', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const coverage: Record<string, unknown> = {};
    for (let index = 1000; index >= 0; index -= 1) {
      const sourcePath = path.join(workspaceRoot, 'src', `${index.toString().padStart(4, '0')}.ts`);
      await mkdir(path.dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, 'export {};');
      coverage[sourcePath] = {
        path: sourcePath,
        statementMap: {},
        fnMap: {},
        branchMap: {},
        s: {},
        f: {},
        b: {},
      };
    }
    const calls: unknown[] = [];
    const capture = await captureTestSnapshot(
      workspaceRoot,
      { execution: {} },
      createDependencies(
        createResult({
          coverage: coverage as NonNullable<TestRunResult['coverage']>,
        }),
        calls,
        'execution-truncated',
      ),
    );

    const stored = await readContextSnapshotById(workspaceRoot, capture.snapshotId);
    expect(stored?.snapshot.completeness.execution).toBe('partial');
    expect(stored?.snapshot.facets.execution).toMatchObject({
      availability: 'available',
      universe: {
        reportedFiles: 1001,
        storedFiles: 1000,
        droppedFiles: 1,
        completeness: 'partial',
      },
      truncated: { files: 1, locations: 0 },
    });
    const files = (
      stored?.snapshot.facets.execution as { files?: Array<{ path: string }> } | undefined
    )?.files;
    expect(files).toHaveLength(1000);
    expect(files?.slice(0, 3)).toEqual([
      {
        path: 'src/0000.ts',
        digest: '2e29cd9a98755c46896f7a2d56524db2d6d96b248e36db46de14c30bf47c8d05',
        statements: [],
        functions: [],
        branches: [],
      },
      {
        path: 'src/0001.ts',
        digest: '2e29cd9a98755c46896f7a2d56524db2d6d96b248e36db46de14c30bf47c8d05',
        statements: [],
        functions: [],
        branches: [],
      },
      {
        path: 'src/0002.ts',
        digest: '2e29cd9a98755c46896f7a2d56524db2d6d96b248e36db46de14c30bf47c8d05',
        statements: [],
        functions: [],
        branches: [],
      },
    ]);
  });
});

test('normalizes failures, retries, skipped and todo cases', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const testPath = path.join(workspaceRoot, 'tests', 'mixed.test.ts');
    await mkdir(path.dirname(testPath), { recursive: true });
    await writeFile(testPath, 'test');
    const calls: unknown[] = [];
    const result = createResult({
      ok: false,
      files: [
        {
          project: 'node',
          testPath,
          name: 'mixed.test.ts',
          status: 'fail',
          errors: [{ name: 'FileError', message: 'file failed' }],
          results: [
            {
              project: 'node',
              testPath,
              name: 'eventually fails',
              status: 'fail',
              errors: [
                {
                  name: 'AssertionError',
                  message: 'expected true',
                  stack: 'stack',
                  diff: '- false\n+ true',
                  actual: 'false',
                  expected: 'true',
                  retryCount: 2,
                },
              ],
              retryErrors: [{ name: 'Error', message: 'attempt one' }],
              retryCount: 2,
            },
            { project: 'node', testPath, name: 'skipped', status: 'skip' },
            { project: 'node', testPath, name: 'later', status: 'todo' },
          ],
        },
      ],
      stats: {
        tests: { total: 3, passed: 0, failed: 1, skipped: 1, todo: 1 },
        files: { total: 1, failed: 1 },
      },
      duration: { total: 30 },
    });

    const capture = await captureTestSnapshot(
      workspaceRoot,
      {},
      createDependencies(result, calls, 'failed'),
    );
    expect(capture.status).toBe('fail');
    const stored = await readContextSnapshotById(workspaceRoot, capture.snapshotId);
    expect(stored?.snapshot.facets.test).toMatchObject({
      files: [
        {
          status: 'fail',
          tests: [
            {
              name: 'eventually fails',
              status: 'fail',
              errors: [
                {
                  name: 'AssertionError',
                  message: 'expected true',
                  stack: 'stack',
                  diff: '- false\n+ true',
                  actual: 'false',
                  expected: 'true',
                  retryCount: 2,
                },
              ],
              retryErrors: [{ name: 'Error', message: 'attempt one' }],
              retryCount: 2,
            },
            { name: 'later', status: 'todo' },
            { name: 'skipped', status: 'skip' },
          ],
        },
      ],
    });
  });
});

test('captures file-level failures without inventing test cases', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const testPath = path.join(workspaceRoot, 'tests', 'broken.test.ts');
    await mkdir(path.dirname(testPath), { recursive: true });
    await writeFile(testPath, 'invalid');
    const calls: unknown[] = [];
    const result = createResult({
      ok: false,
      files: [
        {
          project: 'node',
          testPath,
          name: 'broken.test.ts',
          status: 'fail',
          errors: [
            {
              name: 'ImportError',
              message: 'could not import setup module',
              stack: 'import stack',
            },
          ],
          results: [],
        },
      ],
      stats: {
        tests: { total: 0, passed: 0, failed: 0, skipped: 0, todo: 0 },
        files: { total: 1, failed: 1 },
      },
    });

    const capture = await captureTestSnapshot(
      workspaceRoot,
      {},
      createDependencies(result, calls, 'file-error'),
    );

    expect(
      (await readContextSnapshotById(workspaceRoot, capture.snapshotId))?.snapshot.facets.test,
    ).toMatchObject({
      files: [
        {
          project: 'node',
          path: 'tests/broken.test.ts',
          status: 'fail',
          errors: [
            {
              name: 'ImportError',
              message: 'could not import setup module',
              stack: 'import stack',
            },
          ],
          tests: [],
        },
      ],
    });
    await expect(
      listDiagnostics(workspaceRoot, { snapshotId: capture.snapshotId }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        {
          producer: 'rstest',
          project: 'node',
          path: 'tests/broken.test.ts',
          severity: 'error',
          message: 'could not import setup module',
        },
      ],
    });
    await expect(listTestResults(workspaceRoot, {})).resolves.toEqual({
      producer: 'rstest',
      contextId: capture.contextId,
      snapshotId: capture.snapshotId,
      observedAt: '2026-08-12T08:00:00.000Z',
      completeness: { test: 'complete' },
      freshness: { state: 'partial', changedPaths: [] },
      total: 0,
      items: [],
    });
  });
});

test('records unhandled Rstest errors as an error snapshot', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const calls: unknown[] = [];
    const result = createResult({
      ok: false,
      unhandledErrors: [
        {
          name: 'ConfigError',
          message: 'configuration failed',
          stack: 'config stack',
        },
      ],
    });

    const capture = await captureTestSnapshot(
      workspaceRoot,
      {},
      createDependencies(result, calls, 'error'),
    );
    expect(capture).toMatchObject({
      snapshotId: 'snap_error',
      status: 'error',
      freshness: { state: 'partial', changedPaths: [] },
      summary: { unhandledErrors: 1 },
    });
    expect(
      (await readContextSnapshotById(workspaceRoot, capture.snapshotId))?.snapshot.facets,
    ).toMatchObject({
      test: {
        unhandledErrors: [
          {
            name: 'ConfigError',
            message: 'configuration failed',
            stack: 'config stack',
          },
        ],
      },
    });
  });
});

test('persists a thrown Rstest configuration error as a completed diagnostic snapshot', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const configError = new Error('configuration failed');
    configError.name = 'ConfigError';
    const dependencies: TestCaptureDependencies = {
      runRstest: async () => {
        await expect(readProjectStatus(workspaceRoot)).resolves.toMatchObject({
          contexts: [{ runId: 'run_thrown', state: 'pending' }],
        });
        throw configError;
      },
      createRunId: () => 'run_thrown',
      createSnapshotId: () => 'snap_thrown',
      now: () => new Date('2026-08-12T08:00:00.000Z'),
    };

    await expect(captureTestSnapshot(workspaceRoot, {}, dependencies)).rejects.toBe(configError);

    const stored = await readContextSnapshotById(workspaceRoot, 'snap_thrown');
    expect(stored?.snapshot).toMatchObject({
      runId: 'run_thrown',
      status: 'error',
      completeness: { test: 'partial' },
      facets: {
        test: {
          producer: 'rstest',
          files: [],
          stats: {
            tests: { total: 0, passed: 0, failed: 0, skipped: 0, todo: 0 },
            files: { total: 0, failed: 0 },
          },
          durationMs: 0,
          unhandledErrors: [
            {
              name: 'ConfigError',
              message: 'configuration failed',
              stack: expect.any(String),
            },
          ],
        },
      },
    });
    await expect(
      listDiagnostics(workspaceRoot, { snapshotId: 'snap_thrown' }),
    ).resolves.toMatchObject({
      snapshotId: 'snap_thrown',
      total: 1,
      items: [
        {
          producer: 'rstest',
          severity: 'error',
          message: 'configuration failed',
        },
      ],
    });
  });
});

test('pages project-qualified results in deterministic identity order', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const testPath = path.join(workspaceRoot, 'tests', 'shared.test.ts');
    await mkdir(path.dirname(testPath), { recursive: true });
    await writeFile(testPath, 'test');
    const calls: unknown[] = [];
    const result = createResult({
      files: [
        {
          project: 'web',
          testPath,
          name: 'shared.test.ts',
          status: 'pass',
          results: [
            { project: 'web', testPath, name: 'zeta', status: 'pass' },
            {
              project: 'web',
              testPath,
              parentNames: ['suite'],
              name: 'alpha',
              status: 'skip',
            },
          ],
        },
        {
          project: 'node',
          testPath,
          name: 'shared.test.ts',
          status: 'pass',
          results: [{ project: 'node', testPath, name: 'zeta', status: 'todo' }],
        },
      ],
      stats: {
        tests: { total: 3, passed: 1, failed: 0, skipped: 1, todo: 1 },
        files: { total: 2, failed: 0 },
      },
    });
    const capture = await captureTestSnapshot(
      workspaceRoot,
      {},
      createDependencies(result, calls, 'projects'),
    );

    const first = await listTestResults(workspaceRoot, {
      snapshotId: capture.snapshotId,
      pathPrefix: 'tests/',
      limit: 2,
    });
    expect(first).toEqual({
      producer: 'rstest',
      contextId: capture.contextId,
      snapshotId: capture.snapshotId,
      observedAt: '2026-08-12T08:00:00.000Z',
      completeness: { test: 'complete' },
      freshness: { state: 'partial', changedPaths: [] },
      total: 3,
      items: [
        {
          project: 'node',
          path: 'tests/shared.test.ts',
          name: 'zeta',
          status: 'todo',
        },
        {
          project: 'web',
          path: 'tests/shared.test.ts',
          name: 'zeta',
          status: 'pass',
        },
      ],
      nextCursor: 'Mg',
    });
    await expect(
      listTestResults(workspaceRoot, {
        snapshotId: capture.snapshotId,
        pathPrefix: 'tests/',
        limit: 2,
        cursor: first.nextCursor,
      }),
    ).resolves.toEqual({
      producer: 'rstest',
      contextId: capture.contextId,
      snapshotId: capture.snapshotId,
      observedAt: '2026-08-12T08:00:00.000Z',
      completeness: { test: 'complete' },
      freshness: { state: 'partial', changedPaths: [] },
      total: 3,
      items: [
        {
          project: 'web',
          path: 'tests/shared.test.ts',
          parentNames: ['suite'],
          name: 'alpha',
          status: 'skip',
        },
      ],
    });
    await expect(
      listTestResults(workspaceRoot, { project: 'web', status: 'skip' }),
    ).resolves.toMatchObject({
      total: 1,
      items: [{ project: 'web', name: 'alpha', status: 'skip' }],
    });
  });
});

type AssertNever<T extends never> = T;
type UnsupportedRequestFields = AssertNever<
  Extract<
    keyof TestSnapshotRequest,
    'apply' | 'changed' | 'related' | 'reporter' | 'shard' | 'update' | 'watch'
  >
>;

test('keeps unsupported execution controls out of snapshot requests', () => {
  const unsupportedRequestField = undefined as UnsupportedRequestFields;
  expect(unsupportedRequestField).toBeUndefined();
});
