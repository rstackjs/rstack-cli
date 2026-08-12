import { expect, test } from 'rstack/test';
import { contextStoreSchemaVersion } from '../../src/context/model.ts';
import {
  getContextSnapshotGenerationFileName,
  isContextSnapshotGenerationFileName,
  validateRunManifest,
  validateSnapshot,
} from '../../src/context/records.ts';

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
