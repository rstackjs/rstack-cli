import { expect, test } from '@rstest/core';
import { contextStoreSchemaVersion } from '../src/model.ts';
import {
  getContextSnapshotGenerationFileName,
  isContextSnapshotGenerationFileName,
  validateExecutionFacet,
  validateLintFacet,
  validateRunManifest,
  validateSnapshot,
  validateTestFacet,
} from '../src/records.ts';

const context = {
  contextId: 'ctx_library_esm',
  packageName: '@repo/library',
  packageRoot: 'packages/library',
  configPath: 'packages/library/rstack.config.ts',
  product: 'library',
  environment: 'esm',
};

const run = {
  schemaVersion: contextStoreSchemaVersion,
  runId: 'run_library_watch',
  producer: 'rslib',
  command: 'build:watch',
  startedAt: '2026-08-12T05:00:00.000Z',
  contexts: [context],
};

const snapshot = {
  schemaVersion: contextStoreSchemaVersion,
  snapshotId: 'snap_library_2',
  runId: run.runId,
  contextId: context.contextId,
  sequence: 2,
  observedAt: '2026-08-12T05:00:02.000Z',
  status: 'pass',
  completeness: { build: 'complete' },
  facets: { summary: { errors: 0, warnings: 1 } },
};

test('validates complete run manifests', () => {
  expect(validateRunManifest(run)).toEqual(run);
});

test('rejects malformed run manifests', () => {
  const invalidManifests = [
    null,
    { ...run, schemaVersion: 2 },
    { ...run, runId: 42 },
    { ...run, producer: 'unknown' },
    { ...run, command: 42 },
    { ...run, startedAt: 42 },
    { ...run, contexts: [] },
    { ...run, contexts: [{ ...context, contextId: 42 }] },
    { ...run, contexts: [{ ...context, packageRoot: 42 }] },
    { ...run, contexts: [{ ...context, product: 42 }] },
    { ...run, contexts: [{ ...context, packageName: 42 }] },
  ];

  for (const value of invalidManifests) {
    expect(validateRunManifest(value)).toBeUndefined();
  }
});

test('rejects duplicate context IDs in a run manifest', () => {
  expect(
    validateRunManifest({
      ...run,
      contexts: [context, { ...context, packageRoot: 'packages/other' }],
    }),
  ).toBeUndefined();
});

test('validates complete snapshots', () => {
  expect(validateSnapshot(snapshot)).toEqual(snapshot);
});

test('validates lint and test facets with captured source inputs', () => {
  const lint = {
    producer: 'rslint',
    mode: 'files',
    fixPreviewCaptured: true,
    files: [
      {
        path: 'src/index.ts',
        digest: 'a'.repeat(64),
        errorCount: 1,
        warningCount: 0,
        fixableErrorCount: 1,
        fixableWarningCount: 0,
        messages: [
          {
            ruleId: 'no-debugger',
            severity: 2,
            message: 'Unexpected debugger statement.',
            messageId: 'unexpected',
            line: 1,
            column: 1,
            endLine: 1,
            endColumn: 9,
            fix: { range: [0, 8], text: '' },
            suggestions: [
              {
                messageId: 'remove',
                data: { statement: 'debugger' },
                desc: 'Remove debugger.',
                fix: { range: [0, 8], text: '' },
              },
            ],
          },
        ],
        fixedOutput: '',
      },
    ],
    totals: {
      files: 1,
      errors: 1,
      warnings: 0,
      fixableErrors: 1,
      fixableWarnings: 0,
    },
  } as const;
  const testFacet = {
    producer: 'rstest',
    relation: {
      sources: ['src/index.ts'],
      testFiles: ['src/index.test.ts'],
    },
    files: [
      {
        project: 'unit',
        path: 'src/index.test.ts',
        status: 'fail',
        durationMs: 4,
        tests: [
          {
            project: 'unit',
            path: 'src/index.test.ts',
            name: 'works',
            parentNames: ['suite'],
            status: 'fail',
            durationMs: 3,
            errors: [{ name: 'AssertionError', message: 'failed', retryCount: 1 }],
            retryErrors: [{ name: 'AssertionError', message: 'first attempt' }],
            retryCount: 1,
          },
        ],
      },
    ],
    stats: {
      tests: { total: 1, passed: 0, failed: 1, skipped: 0, todo: 0 },
      files: { total: 1, failed: 1 },
    },
    durationMs: 5,
    unhandledErrors: [],
  } as const;
  const captured = {
    ...snapshot,
    source: {
      inputs: [{ path: 'src/index.ts', digest: 'b'.repeat(64) }],
      inputCompleteness: 'complete',
    },
    facets: { lint, test: testFacet },
  };

  expect(validateLintFacet(lint)).toEqual(lint);
  expect(validateTestFacet(testFacet)).toEqual(testFacet);
  expect(validateSnapshot(captured)).toEqual(captured);
});

test('validates aggregate Rstest execution facets before generic producer routing', () => {
  const execution = {
    producer: 'rstest',
    provider: 'istanbul',
    availability: 'available',
    requestedSelection: { include: ['src/**/*.ts'], allowExternal: false },
    digest: 'c'.repeat(64),
    universe: {
      reportedFiles: 1,
      storedFiles: 1,
      droppedFiles: 0,
      reportedLocations: 6,
      storedLocations: 6,
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
        path: 'src/index.ts',
        digest: 'd'.repeat(64),
        statements: [
          {
            id: '0',
            location: {
              start: { line: 1, column: 0 },
              end: { line: 1, column: 10 },
            },
            hits: 1,
          },
        ],
        functions: [
          {
            id: '0',
            name: 'main',
            declaration: {
              start: { line: 1, column: 0 },
              end: { line: 1, column: 4 },
            },
            location: {
              start: { line: 1, column: 7 },
              end: { line: 1, column: 10 },
            },
            hits: 1,
          },
        ],
        branches: [
          {
            id: '0',
            type: 'if',
            location: {
              start: { line: 2, column: 0 },
              end: { line: 2, column: 10 },
            },
            arms: [
              {
                location: {
                  start: { line: 2, column: 4 },
                  end: { line: 2, column: 7 },
                },
                hits: 0,
              },
              {
                location: {
                  start: { line: 2, column: 8 },
                  end: { line: 2, column: 10 },
                },
                hits: 1,
              },
            ],
          },
        ],
      },
    ],
  } as const;

  expect(validateExecutionFacet(execution)).toEqual(execution);
  expect(validateSnapshot({ ...snapshot, facets: { execution } })).toEqual({
    ...snapshot,
    facets: { execution },
  });
  expect(validateExecutionFacet({ ...execution, digest: 'not-a-digest' })).toBeUndefined();
  expect(
    validateExecutionFacet({
      ...execution,
      bounds: { ...execution.bounds, testAttribution: true },
    }),
  ).toBeUndefined();
  expect(
    validateSnapshot({
      ...snapshot,
      facets: { execution: { ...execution, files: [{ testId: 'owned' }] } },
    }),
  ).toBeUndefined();
  expect(
    validateExecutionFacet({
      ...execution,
      files: Array.from({ length: 1001 }, (_, index) => ({
        path: `src/${index}.ts`,
        statements: [],
        functions: [],
        branches: [],
      })),
      universe: {
        ...execution.universe,
        reportedFiles: 1001,
        storedFiles: 1001,
        reportedLocations: 0,
        storedLocations: 0,
      },
    }),
  ).toBeUndefined();
  expect(
    validateExecutionFacet({
      ...execution,
      files: [
        {
          path: 'src/index.ts',
          statements: Array.from({ length: 20_001 }, (_, index) => ({
            id: String(index),
            location: {
              start: { line: 1, column: 0 },
              end: { line: 1, column: 1 },
            },
            hits: 0,
          })),
          functions: [],
          branches: [],
        },
      ],
      universe: {
        ...execution.universe,
        reportedLocations: 20_001,
        storedLocations: 20_001,
      },
    }),
  ).toBeUndefined();
  expect(
    validateExecutionFacet({
      ...execution,
      files: Array.from({ length: 6 }, (_, fileIndex) => ({
        path: `src/${fileIndex}.ts`,
        statements: Array.from({ length: 20_000 }, (_, index) => ({
          id: String(index),
          location: {
            start: { line: 1, column: 0 },
            end: { line: 1, column: 1 },
          },
          hits: 0,
        })),
        functions: [],
        branches: [],
      })),
      universe: {
        ...execution.universe,
        reportedFiles: 6,
        storedFiles: 6,
        reportedLocations: 120_000,
        storedLocations: 120_000,
      },
    }),
  ).toBeUndefined();
});

test('rejects malformed known facets and unpaired source input metadata', () => {
  const lint = {
    producer: 'rslint',
    mode: 'files',
    fixPreviewCaptured: false,
    files: [],
    totals: {
      files: 0,
      errors: 0,
      warnings: 0,
      fixableErrors: 0,
      fixableWarnings: 0,
    },
  } as const;
  const testFacet = {
    producer: 'rstest',
    files: [],
    stats: {
      tests: { total: 0, passed: 0, failed: 0, skipped: 0, todo: 0 },
      files: { total: 0, failed: 0 },
    },
    durationMs: 0,
    unhandledErrors: [],
  } as const;

  expect(validateLintFacet({ ...lint, mode: 'watch' })).toBeUndefined();
  expect(validateLintFacet({ ...lint, files: [{ path: 'a.ts' }] })).toBeUndefined();
  expect(validateTestFacet({ ...testFacet, durationMs: -1 })).toBeUndefined();
  expect(
    validateTestFacet({
      ...testFacet,
      relation: { sources: ['src/index.ts'], testFiles: [42] },
    }),
  ).toBeUndefined();
  expect(
    validateTestFacet({
      ...testFacet,
      files: [{ project: 'unit', path: 'a.test.ts', status: 'unknown', tests: [] }],
    }),
  ).toBeUndefined();
  expect(
    validateTestFacet({
      ...testFacet,
      files: [
        {
          project: 'unit',
          path: 'a.test.ts',
          status: 'fail',
          errors: [{ name: 'ImportError' }],
          tests: [],
        },
      ],
    }),
  ).toBeUndefined();
  expect(
    validateSnapshot({
      ...snapshot,
      source: { inputs: [{ path: 'src/index.ts', digest: 'not-a-digest' }] },
    }),
  ).toBeUndefined();
  expect(
    validateSnapshot({
      ...snapshot,
      source: { inputCompleteness: 'complete' },
    }),
  ).toBeUndefined();
  expect(
    validateSnapshot({
      ...snapshot,
      source: { captureSelection: { patterns: [Symbol('not-json')] } },
    }),
  ).toBeUndefined();
  expect(
    validateSnapshot({
      ...snapshot,
      facets: { lint: { ...lint, mode: 'watch' } },
    }),
  ).toBeUndefined();
  expect(
    validateSnapshot({
      ...snapshot,
      facets: { test: { ...testFacet, durationMs: -1 } },
    }),
  ).toBeUndefined();
});

test('keeps legacy sources and unknown JSON facets valid', () => {
  const legacy = {
    ...snapshot,
    source: { revision: 'abc123', dirtyDigest: 'dirty' },
    facets: { future: { producer: 'future', values: [true, null, 1, 'one'] } },
  };

  expect(validateSnapshot(legacy)).toEqual(legacy);
});

test('rejects malformed snapshots', () => {
  const invalidSnapshots = [
    null,
    { ...snapshot, schemaVersion: 2 },
    { ...snapshot, snapshotId: 42 },
    { ...snapshot, runId: 42 },
    { ...snapshot, contextId: 42 },
    { ...snapshot, sequence: -1 },
    { ...snapshot, sequence: 1.5 },
    { ...snapshot, observedAt: 42 },
    { ...snapshot, status: 'unknown' },
    { ...snapshot, completeness: [] },
    { ...snapshot, completeness: { build: 'unknown' } },
    { ...snapshot, facets: [] },
  ];

  for (const value of invalidSnapshots) {
    expect(validateSnapshot(value)).toBeUndefined();
  }
});

test('creates and recognizes canonical snapshot generation file names', () => {
  expect(getContextSnapshotGenerationFileName(snapshot)).toBe('0000000002-snap_library_2.json');
  expect(isContextSnapshotGenerationFileName('0000000002-snap_library_2.json', snapshot)).toBe(
    true,
  );
  expect(isContextSnapshotGenerationFileName('2-snap_library_2.json', snapshot)).toBe(false);
  expect(isContextSnapshotGenerationFileName('0000000002-other.json', snapshot)).toBe(false);
});
