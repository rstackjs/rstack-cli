import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@rstest/core';
import {
  contextStoreSchemaVersion,
  writeContextRunManifest,
  writeContextSnapshot,
  type ContextDescriptor,
  type ContextProducer,
  type ContextRunManifest,
  type ContextSnapshot,
  type JsonValue,
  type LintFacet,
  type TestFacet,
} from '../src/index.ts';
import { readCodeEvidence } from '../src/codeEvidence.ts';
import type { TestExecutionFacet } from '../src/model.ts';

const fixtureRoot = path.resolve(
  import.meta.dirname,
  '../fixtures/context/reachability/application',
);

const digest = (value: string): string => createHash('sha256').update(value).digest('hex');

const withTempWorkspace = async (
  callback: (workspaceRoot: string) => Promise<void>,
): Promise<void> => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-code-evidence-'));
  try {
    await callback(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
};

const writeSnapshot = async (
  workspaceRoot: string,
  options: {
    producer: ContextProducer;
    snapshotId: string;
    observedAt: string;
    context?: ContextDescriptor;
    facets: ContextSnapshot['facets'];
    completeness: ContextSnapshot['completeness'];
  },
): Promise<void> => {
  const context =
    options.context ??
    ({
      contextId: `ctx_${options.snapshotId}`,
      packageRoot: '.',
      product:
        options.producer === 'rslint' || options.producer === 'rstest'
          ? 'development'
          : 'application',
      ...(options.producer === 'rslint' ? { environment: 'lint' } : {}),
      ...(options.producer === 'rstest' ? { environment: 'test' } : {}),
    } satisfies ContextDescriptor);
  const run = {
    schemaVersion: contextStoreSchemaVersion,
    runId: `run_${options.snapshotId}`,
    producer: options.producer,
    command:
      options.producer === 'rstest' ? 'test' : options.producer === 'rslint' ? 'lint' : 'build',
    startedAt: options.observedAt,
    contexts: [context],
  } satisfies ContextRunManifest;
  expect(await writeContextRunManifest(workspaceRoot, run)).toMatchObject({ written: true });
  expect(
    await writeContextSnapshot(workspaceRoot, {
      schemaVersion: contextStoreSchemaVersion,
      snapshotId: options.snapshotId,
      runId: run.runId,
      contextId: context.contextId,
      sequence: 0,
      observedAt: options.observedAt,
      status: 'pass',
      completeness: options.completeness,
      facets: options.facets,
    }),
  ).toMatchObject({ written: true });
};

const testFacet = (filePath: string, status: 'pass' | 'fail', message: string): TestFacet => ({
  producer: 'rstest',
  files: [
    {
      project: 'default',
      path: filePath,
      status,
      ...(status === 'fail' ? { errors: [{ name: 'Error', message }] } : {}),
      tests: [
        {
          project: 'default',
          path: filePath,
          name: 'behavior',
          status,
          ...(status === 'fail' ? { errors: [{ name: 'Error', message: `${message} case` }] } : {}),
        },
      ],
    },
  ],
  stats: {
    tests: {
      total: 1,
      passed: status === 'pass' ? 1 : 0,
      failed: status === 'fail' ? 1 : 0,
      skipped: 0,
      todo: 0,
    },
    files: { total: 1, failed: status === 'fail' ? 1 : 0 },
  },
  durationMs: 1,
  unhandledErrors: [],
});

const executionFacet = (
  filePath: string,
  fileDigest: string,
  hits: number,
  completeness: 'complete' | 'partial' = 'complete',
): TestExecutionFacet => ({
  producer: 'rstest',
  provider: 'istanbul',
  availability: 'available',
  requestedSelection: { allowExternal: false },
  digest: 'e'.repeat(64),
  universe: {
    reportedFiles: 1,
    storedFiles: 1,
    droppedFiles: 0,
    reportedLocations: 5,
    storedLocations: 5,
    droppedLocations: 0,
    completeness,
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
      path: filePath,
      digest: fileDigest,
      statements: [
        {
          id: '0',
          location: { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
          hits,
        },
      ],
      functions: [
        {
          id: '0',
          name: 'value',
          declaration: { start: { line: 1, column: 0 }, end: { line: 1, column: 5 } },
          location: { start: { line: 2, column: 0 }, end: { line: 3, column: 1 } },
          hits,
        },
      ],
      branches: [
        {
          id: '0',
          type: 'if',
          location: { start: { line: 2, column: 0 }, end: { line: 3, column: 1 } },
          arms: [
            {
              location: { start: { line: 3, column: 0 }, end: { line: 3, column: 1 } },
              hits,
            },
          ],
        },
      ],
    },
  ],
});

const lintFacet = (filePath: string): LintFacet => ({
  producer: 'rslint',
  mode: 'files',
  fixPreviewCaptured: false,
  files: [
    {
      path: filePath,
      digest: 'a'.repeat(64),
      errorCount: 0,
      warningCount: 1,
      fixableErrorCount: 0,
      fixableWarningCount: 0,
      messages: [
        { ruleId: 'no-example', severity: 1, message: 'lint warning', line: 2, column: 1 },
      ],
    },
  ],
  totals: { files: 1, errors: 0, warnings: 1, fixableErrors: 0, fixableWarnings: 0 },
});

test('joins newest exact-path execution, test outcome, and diagnostics without inferring related tests', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const source = 'export function value() {\n  return 1;\n}\n';
    const sourcePath = path.join(workspaceRoot, 'src', 'value.ts');
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, source);

    await writeSnapshot(workspaceRoot, {
      producer: 'rstest',
      snapshotId: 'snap_old',
      observedAt: '2026-08-13T01:00:00.000Z',
      facets: {
        test: testFacet('src/value.ts', 'pass', 'old') as unknown as JsonValue,
        execution: executionFacet('src/value.ts', digest(source), 0) as unknown as JsonValue,
      },
      completeness: { test: 'complete', execution: 'complete' },
    });
    await writeSnapshot(workspaceRoot, {
      producer: 'rstest',
      snapshotId: 'snap_new',
      observedAt: '2026-08-13T02:00:00.000Z',
      facets: {
        test: testFacet('src/value.ts', 'fail', 'test failed') as unknown as JsonValue,
        execution: executionFacet('src/value.ts', digest(source), 3) as unknown as JsonValue,
      },
      completeness: { test: 'complete', execution: 'complete' },
    });
    await writeSnapshot(workspaceRoot, {
      producer: 'rslint',
      snapshotId: 'snap_lint',
      observedAt: '2026-08-13T03:00:00.000Z',
      facets: { lint: lintFacet('src/value.ts') as unknown as JsonValue },
      completeness: { lint: 'complete' },
    });

    const result = await readCodeEvidence(workspaceRoot, { path: './src\\value.ts', line: 2 });
    expect(result).toMatchObject({
      path: 'src/value.ts',
      line: 2,
      executionCoverage: {
        state: 'observed',
        relevantLocations: 2,
        observedLocations: 2,
      },
      testOutcome: { state: 'failed', matchingFiles: 1, matchingTests: 1 },
      diagnostics: {
        total: 3,
        returned: 3,
        truncated: false,
        items: [
          { producer: 'rslint', path: 'src/value.ts', message: 'lint warning' },
          { producer: 'rstest', path: 'src/value.ts', message: 'test failed' },
          { producer: 'rstest', path: 'src/value.ts', message: 'test failed case' },
        ],
      },
      provenance: {
        test: { snapshotId: 'snap_new', completeness: { test: 'complete', execution: 'complete' } },
        lint: { snapshotId: 'snap_lint', completeness: { lint: 'complete' } },
      },
    });
    expect(result.bounds).toContain('test-outcome-exact-path-only');
    expect(result.bounds).toContain('aggregate-execution-no-test-attribution');

    await expect(
      readCodeEvidence(workspaceRoot, {
        path: 'src/value.ts',
        line: 2,
        testSnapshotId: 'snap_old',
      }),
    ).resolves.toMatchObject({
      executionCoverage: { state: 'not-observed' },
      testOutcome: { state: 'passed' },
      provenance: { test: { snapshotId: 'snap_old' } },
    });
  });
});

test('keeps missing, stale, incomplete, and non-overlapping execution evidence inconclusive', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const sourcePath = path.join(workspaceRoot, 'packages', 'one', 'src', 'value.ts');
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, 'before');
    const context = {
      contextId: 'ctx_test_package',
      packageRoot: 'packages/one',
      product: 'development',
      environment: 'test',
    } as const;
    await writeSnapshot(workspaceRoot, {
      producer: 'rstest',
      snapshotId: 'snap_partial',
      observedAt: '2026-08-13T01:00:00.000Z',
      context,
      facets: {
        test: testFacet('packages/one/src/value.ts', 'pass', 'unused') as unknown as JsonValue,
        execution: executionFacet(
          'packages/one/src/value.ts',
          digest('before'),
          0,
          'partial',
        ) as unknown as JsonValue,
      },
      completeness: { test: 'complete', execution: 'partial' },
    });

    const partial = await readCodeEvidence(workspaceRoot, {
      path: 'packages/one/src/value.ts',
      line: 2,
    });
    expect(partial.executionCoverage).toMatchObject({
      state: 'unknown',
      reason: 'partial-universe',
    });

    await writeFile(sourcePath, 'after');
    const stale = await readCodeEvidence(workspaceRoot, {
      path: 'packages/one/src/value.ts',
    });
    expect(stale.executionCoverage).toMatchObject({ state: 'unknown', reason: 'digest-mismatch' });

    const absent = await readCodeEvidence(workspaceRoot, { path: 'packages/two/src/value.ts' });
    expect(absent).toMatchObject({
      executionCoverage: { state: 'unavailable', reason: 'no-test-snapshot' },
      testOutcome: { state: 'unknown' },
    });
    await expect(
      readCodeEvidence(workspaceRoot, {
        path: 'packages/two/src/value.ts',
        testSnapshotId: 'snap_partial',
      }),
    ).rejects.toThrow('Selected Rstest snapshot package root does not contain the source path.');
  });
});

test('distinguishes absent exact test records from matching skipped or todo records', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const facet = testFacet('src/other.test.ts', 'pass', 'unused');
    facet.files.push({
      project: 'default',
      path: 'src/skipped.test.ts',
      status: 'skip',
      tests: [
        { project: 'default', path: 'src/skipped.test.ts', name: 'skipped', status: 'skip' },
        { project: 'default', path: 'src/skipped.test.ts', name: 'todo', status: 'todo' },
      ],
    });
    await writeSnapshot(workspaceRoot, {
      producer: 'rstest',
      snapshotId: 'snap_test_outcomes',
      observedAt: '2026-08-13T01:00:00.000Z',
      facets: { test: facet as unknown as JsonValue },
      completeness: { test: 'complete' },
    });

    await expect(
      readCodeEvidence(workspaceRoot, { path: 'src/missing.ts' }),
    ).resolves.toMatchObject({
      testOutcome: {
        state: 'unknown',
        reason: 'no-exact-test-record',
        matchingFiles: 0,
        matchingTests: 0,
      },
    });
    await expect(
      readCodeEvidence(workspaceRoot, { path: 'src/skipped.test.ts' }),
    ).resolves.toMatchObject({
      testOutcome: { state: 'not-run', matchingFiles: 1, matchingTests: 2 },
    });
  });
});

test('bounds exact-path diagnostics to two hundred records', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const facet = lintFacet('src/noisy.ts');
    facet.files[0]!.messages = Array.from({ length: 205 }, (_, index) => ({
      ruleId: 'no-noise',
      severity: 1 as const,
      message: `diagnostic ${String(index).padStart(3, '0')}`,
      line: index + 1,
      column: 1,
    }));
    facet.files[0]!.warningCount = 205;
    facet.totals.warnings = 205;
    await writeSnapshot(workspaceRoot, {
      producer: 'rslint',
      snapshotId: 'snap_noisy',
      observedAt: '2026-08-13T01:00:00.000Z',
      facets: { lint: facet as unknown as JsonValue },
      completeness: { lint: 'complete' },
    });

    await expect(readCodeEvidence(workspaceRoot, { path: 'src/noisy.ts' })).resolves.toMatchObject({
      diagnostics: { total: 205, returned: 200, truncated: true },
    });
  });
});

test('adds an independent module axis only for an explicit artifact and exposes binding mismatch', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await cp(fixtureRoot, workspaceRoot, { recursive: true });
    const sourcePath = path.join(workspaceRoot, 'src', 'live.ts');
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, 'export const live = true;\n');
    const context = {
      contextId: 'ctx_app_web',
      packageRoot: '.',
      product: 'application',
      environment: 'web',
      target: 'web',
    } as const;
    await writeSnapshot(workspaceRoot, {
      producer: 'rsbuild',
      snapshotId: 'snap_build',
      observedAt: '2026-08-13T01:00:00.000Z',
      context,
      facets: {
        build: {
          producer: 'rsbuild',
          command: 'build',
          environment: 'web',
          target: ['web'],
          isWatch: false,
          isFirstCompile: true,
          durationMs: 1,
          hash: 'expected-hash',
          hasErrors: false,
          hasWarnings: false,
          assets: [],
          chunks: [],
          truncated: { assets: 0, chunks: 0 },
        },
      },
      completeness: { build: 'complete' },
    });
    const dataFile = path.join(workspaceRoot, 'rsdoctor-data.json');
    const artifact = JSON.parse(await readFile(dataFile, 'utf8')) as Record<string, unknown>;
    const metadata = {
      schemaVersion: 1,
      producer: { name: '@rsdoctor/core', version: '1.6.0' },
      output: { mode: 'normal' },
      build: {
        id: 'build',
        root: workspaceRoot,
        compiler: { name: 'web', type: 'rspack', version: '1.7.0' },
        compilationHash: 'expected-hash',
        environment: 'web',
        target: ['web'],
      },
      sections: Object.fromEntries(
        [
          'errors',
          'configs',
          'summary',
          'resolver',
          'loader',
          'moduleGraph',
          'chunkGraph',
          'moduleCodeMap',
          'plugin',
          'packageGraph',
          'treeShaking',
          'otherReports',
        ].map((section) => [section, { status: 'collected' }]),
      ),
    };
    artifact.metadata = metadata;
    await writeFile(dataFile, JSON.stringify(artifact));

    const exact = await readCodeEvidence(workspaceRoot, {
      path: 'src/live.ts',
      contextId: context.contextId,
      dataFile: 'rsdoctor-data.json',
      maxDepth: 4,
    });
    expect(exact.module).toMatchObject({
      provenance: { artifactBinding: 'exact' },
      subject: { id: '2', path: 'src/live.ts' },
      state: {
        productionReachability: 'live',
        publicContract: 'not-required',
        shipped: 'yes',
      },
    });

    (metadata.build as Record<string, unknown>).compilationHash = 'different-hash';
    artifact.metadata = metadata;
    await writeFile(dataFile, JSON.stringify(artifact));
    const mismatch = await readCodeEvidence(workspaceRoot, {
      path: 'src/live.ts',
      contextId: context.contextId,
      dataFile: 'rsdoctor-data.json',
    });
    expect(mismatch.module).toMatchObject({
      provenance: { artifactBinding: 'mismatch' },
      classification: 'insufficient-evidence',
    });
    expect(mismatch.bounds).toContain('artifact-binding-not-exact');

    await expect(
      readCodeEvidence(workspaceRoot, { path: 'src/live.ts', dataFile: 'rsdoctor-data.json' }),
    ).rejects.toThrow('contextId and dataFile must be supplied together.');
  });
});

test('uses the full workspace path before a package-relative artifact fallback', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await cp(fixtureRoot, workspaceRoot, { recursive: true });
    const dataFile = path.join(workspaceRoot, 'rsdoctor-data.json');
    const artifact = JSON.parse(await readFile(dataFile, 'utf8')) as {
      data: { moduleGraph: { modules: Array<Record<string, unknown>> } };
    };
    artifact.data.moduleGraph.modules.push(
      { id: 'pkg-a', path: 'packages/a/src/shared.ts', name: 'shared-a', chunks: ['a'] },
      { id: 'pkg-b', path: 'packages/b/src/shared.ts', name: 'shared-b', chunks: ['b'] },
    );
    await writeFile(dataFile, JSON.stringify(artifact));
    const context = {
      contextId: 'ctx_package_a',
      packageRoot: 'packages/a',
      product: 'application',
    } as const;
    await writeSnapshot(workspaceRoot, {
      producer: 'rsbuild',
      snapshotId: 'snap_package_a',
      observedAt: '2026-08-13T01:00:00.000Z',
      context,
      facets: {},
      completeness: { build: 'partial' },
    });

    await expect(
      readCodeEvidence(workspaceRoot, {
        path: 'packages/a/src/shared.ts',
        contextId: context.contextId,
        dataFile: 'rsdoctor-data.json',
      }),
    ).resolves.toMatchObject({ module: { subject: { id: 'pkg-a' } } });
  });
});

test('preserves execution and diagnostics when the full artifact module path is ambiguous', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await cp(fixtureRoot, workspaceRoot, { recursive: true });
    const source = 'export const shared = true;\n';
    const sourcePath = path.join(workspaceRoot, 'packages', 'a', 'src', 'shared.ts');
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, source);
    const dataFile = path.join(workspaceRoot, 'rsdoctor-data.json');
    const artifact = JSON.parse(await readFile(dataFile, 'utf8')) as {
      data: { moduleGraph: { modules: Array<Record<string, unknown>> } };
    };
    artifact.data.moduleGraph.modules.push(
      { id: 'pkg-a-one', path: 'packages/a/src/shared.ts', name: 'shared-one', chunks: ['a'] },
      { id: 'pkg-a-two', path: 'packages/a/src/shared.ts', name: 'shared-two', chunks: ['a'] },
    );
    await writeFile(dataFile, JSON.stringify(artifact));

    const buildContext = {
      contextId: 'ctx_package_a_build',
      packageRoot: 'packages/a',
      product: 'application',
    } as const;
    await writeSnapshot(workspaceRoot, {
      producer: 'rsbuild',
      snapshotId: 'snap_package_a_build',
      observedAt: '2026-08-13T01:00:00.000Z',
      context: buildContext,
      facets: {},
      completeness: { build: 'partial' },
    });
    const testContext = {
      contextId: 'ctx_package_a_test',
      packageRoot: 'packages/a',
      product: 'development',
      environment: 'test',
    } as const;
    await writeSnapshot(workspaceRoot, {
      producer: 'rstest',
      snapshotId: 'snap_package_a_test',
      observedAt: '2026-08-13T02:00:00.000Z',
      context: testContext,
      facets: {
        test: testFacet('packages/a/src/shared.ts', 'pass', 'unused') as unknown as JsonValue,
        execution: executionFacet(
          'packages/a/src/shared.ts',
          digest(source),
          1,
        ) as unknown as JsonValue,
      },
      completeness: { test: 'complete', execution: 'complete' },
    });
    const lintContext = {
      contextId: 'ctx_package_a_lint',
      packageRoot: 'packages/a',
      product: 'development',
      environment: 'lint',
    } as const;
    await writeSnapshot(workspaceRoot, {
      producer: 'rslint',
      snapshotId: 'snap_package_a_lint',
      observedAt: '2026-08-13T03:00:00.000Z',
      context: lintContext,
      facets: { lint: lintFacet('packages/a/src/shared.ts') as unknown as JsonValue },
      completeness: { lint: 'complete' },
    });

    await expect(
      readCodeEvidence(workspaceRoot, {
        path: 'packages/a/src/shared.ts',
        contextId: buildContext.contextId,
        dataFile: 'rsdoctor-data.json',
      }),
    ).resolves.toMatchObject({
      executionCoverage: { state: 'observed' },
      diagnostics: { total: 1, returned: 1, truncated: false },
      module: {
        classification: 'insufficient-evidence',
        evidence: ['No unique artifact module matched the exact source path.'],
      },
    });

    await expect(
      readCodeEvidence(workspaceRoot, {
        path: 'packages/a/src/shared.ts',
        contextId: buildContext.contextId,
        dataFile: 'rsdoctor-data.json',
        module: 'pkg-a-two',
      }),
    ).resolves.toMatchObject({
      executionCoverage: { state: 'observed' },
      diagnostics: { total: 1, returned: 1, truncated: false },
      module: { subject: { id: 'pkg-a-two' } },
    });
  });
});
