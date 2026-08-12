import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { contextStoreSchemaVersion, type ContextSnapshot } from '../../src/context/model.ts';
import { validateRunManifest } from '../../src/context/records.ts';
import {
  assessSnapshotFreshness,
  createExplicitContextDescriptor,
  createExplicitRun,
  recordContextInputFiles,
} from '../../src/context/source.ts';

const withTempWorkspace = async (
  callback: (workspaceRoot: string) => Promise<void>,
): Promise<void> => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-context-source-'));

  try {
    await callback(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
};

const createSnapshot = (source?: ContextSnapshot['source']): ContextSnapshot => ({
  schemaVersion: contextStoreSchemaVersion,
  snapshotId: 'snap_source',
  runId: 'run_source',
  contextId: 'ctx_source',
  sequence: 0,
  observedAt: '2026-08-12T08:00:00.000Z',
  status: 'pass',
  completeness: {},
  facets: {},
  ...(source === undefined ? {} : { source }),
});

test('records sorted SHA-256 inputs and reports complete inputs as fresh', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await mkdir(path.join(workspaceRoot, 'src'));
    await writeFile(path.join(workspaceRoot, 'src', 'b.ts'), 'b');
    await writeFile(path.join(workspaceRoot, 'src', 'a.ts'), 'a');

    const inputs = await recordContextInputFiles(workspaceRoot, [
      path.join(workspaceRoot, 'src', 'b.ts'),
      path.join(workspaceRoot, 'src', 'a.ts'),
    ]);

    expect(inputs).toEqual([
      {
        path: 'src/a.ts',
        digest: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
      },
      {
        path: 'src/b.ts',
        digest: '3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d',
      },
    ]);
    await expect(
      assessSnapshotFreshness(
        workspaceRoot,
        createSnapshot({ inputs, inputCompleteness: 'complete' }),
      ),
    ).resolves.toEqual({ state: 'fresh', changedPaths: [] });
  });
});

test('reports changed and missing inputs as stale in lexical order', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await mkdir(path.join(workspaceRoot, 'src'));
    await writeFile(path.join(workspaceRoot, 'src', 'b.ts'), 'b');
    await writeFile(path.join(workspaceRoot, 'src', 'a.ts'), 'a');
    const inputs = await recordContextInputFiles(workspaceRoot, ['src/b.ts', 'src/a.ts']);

    await writeFile(path.join(workspaceRoot, 'src', 'b.ts'), 'changed');
    await unlink(path.join(workspaceRoot, 'src', 'a.ts'));

    await expect(
      assessSnapshotFreshness(
        workspaceRoot,
        createSnapshot({ inputs, inputCompleteness: 'complete' }),
      ),
    ).resolves.toEqual({
      state: 'stale',
      changedPaths: ['src/a.ts', 'src/b.ts'],
    });
  });
});

test('preserves partial and unknown freshness semantics', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeFile(path.join(workspaceRoot, 'test.ts'), 'test');
    const inputs = await recordContextInputFiles(workspaceRoot, ['test.ts']);

    await expect(
      assessSnapshotFreshness(
        workspaceRoot,
        createSnapshot({ inputs, inputCompleteness: 'partial' }),
      ),
    ).resolves.toEqual({ state: 'partial', changedPaths: [] });
    await expect(
      assessSnapshotFreshness(
        workspaceRoot,
        createSnapshot({
          inputs,
          inputCompleteness: 'complete',
          virtualInputDigest: 'f'.repeat(64),
        }),
      ),
    ).resolves.toEqual({ state: 'unknown', changedPaths: [] });
    await expect(assessSnapshotFreshness(workspaceRoot, createSnapshot())).resolves.toEqual({
      state: 'unknown',
      changedPaths: [],
    });
  });
});

test('creates stable explicit contexts and unique testable runs', () => {
  const workspaceRoot = path.join(path.sep, 'workspace');
  const options = {
    producer: 'rslint' as const,
    workspaceRoot,
    packageRoot: path.join(workspaceRoot, 'packages', 'library'),
    packageName: '@repo/library',
    configPath: path.join(workspaceRoot, 'packages', 'library', 'rslint.config.ts'),
  };
  const context = createExplicitContextDescriptor(options);

  expect(context).toEqual({
    contextId: expect.stringMatching(/^ctx_[0-9a-f]{24}$/u),
    packageRoot: 'packages/library',
    packageName: '@repo/library',
    configPath: 'packages/library/rslint.config.ts',
    product: 'development',
    environment: 'lint',
  });
  expect(createExplicitContextDescriptor(options)).toEqual(context);
  expect(createExplicitContextDescriptor({ ...options, producer: 'rstest' })).not.toEqual(context);
  expect(
    createExplicitRun({
      producer: 'rslint',
      context,
      command: 'lint',
      createRunId: () => 'run_explicit',
      now: () => new Date('2026-08-12T08:00:00.000Z'),
    }),
  ).toEqual({
    schemaVersion: contextStoreSchemaVersion,
    runId: 'run_explicit',
    producer: 'rslint',
    command: 'lint',
    startedAt: '2026-08-12T08:00:00.000Z',
    contexts: [context],
  });
});

test('represents the workspace root as a valid package path', () => {
  const workspaceRoot = path.join(path.sep, 'workspace');
  const context = createExplicitContextDescriptor({
    producer: 'rstest',
    workspaceRoot,
    packageRoot: workspaceRoot,
    configPath: path.join(workspaceRoot, 'rstest.config.ts'),
  });
  const run = createExplicitRun({
    producer: 'rstest',
    context,
    command: 'test',
    createRunId: () => 'run_root',
    now: () => new Date('2026-08-12T08:00:00.000Z'),
  });

  expect(context.packageRoot).toBe('.');
  expect(validateRunManifest(run)).toEqual(run);
});
