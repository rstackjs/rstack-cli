import { lstat, mkdir, mkdtemp, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import {
  applyContextRetention,
  contextStoreSchemaVersion,
  planContextRetention,
  writeContextRunManifest,
  writeContextSnapshot,
  type ContextDescriptor,
  type ContextRunManifest,
  type ContextSnapshot,
} from '../../src/context/index.ts';

const now = new Date('2026-08-12T12:00:00.000Z');
const oldAt = new Date('2026-07-01T12:00:00.000Z');

const storeRoot = (workspaceRoot: string): string =>
  path.join(workspaceRoot, '.rstack', 'cache', 'context-v1');

const runRoot = (workspaceRoot: string, runId: string): string =>
  path.join(storeRoot(workspaceRoot), 'runs', runId);

const manifestPath = (workspaceRoot: string, runId: string): string =>
  path.join(runRoot(workspaceRoot, runId), 'run.json');

const generationPath = (workspaceRoot: string, runId: string, contextId: string): string =>
  path.join(
    runRoot(workspaceRoot, runId),
    'contexts',
    contextId,
    'generations',
    `0000000001-snapshot_${runId}.json`,
  );

const withTempWorkspace = async (
  callback: (workspaceRoot: string) => Promise<void>,
): Promise<void> => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-context-retention-'));

  try {
    await callback(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
};

const createCompletedRun = async (
  workspaceRoot: string,
  sequence: number,
  observedAt: Date = oldAt,
): Promise<ContextRunManifest> => {
  const runId = `run_${sequence.toString().padStart(2, '0')}`;
  const context: ContextDescriptor = {
    contextId: `context_${runId}`,
    packageRoot: 'packages/example',
    product: 'application',
  };
  const run: ContextRunManifest = {
    schemaVersion: contextStoreSchemaVersion,
    runId,
    producer: 'rsbuild',
    command: 'build',
    startedAt: observedAt.toISOString(),
    contexts: [context],
  };
  const snapshot: ContextSnapshot = {
    schemaVersion: contextStoreSchemaVersion,
    snapshotId: `snapshot_${runId}`,
    runId,
    contextId: context.contextId,
    sequence: 1,
    observedAt: observedAt.toISOString(),
    status: 'pass',
    completeness: { build: 'complete' },
    facets: { summary: { errors: 0 } },
  };

  expect(await writeContextRunManifest(workspaceRoot, run)).toMatchObject({
    written: true,
  });
  expect(await writeContextSnapshot(workspaceRoot, snapshot)).toMatchObject({
    written: true,
  });
  await Promise.all([
    utimes(manifestPath(workspaceRoot, runId), observedAt, observedAt),
    utimes(generationPath(workspaceRoot, runId, context.contextId), observedAt, observedAt),
  ]);
  return run;
};

test('uses the default bounds deterministically and never selects the newest ten runs', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    for (let sequence = 1; sequence <= 41; sequence += 1) {
      await createCompletedRun(
        workspaceRoot,
        sequence,
        new Date(now.getTime() - 2 * 60 * 60 * 1000 + sequence * 1000),
      );
    }

    const firstPlan = await planContextRetention(workspaceRoot, { now });
    const secondPlan = await planContextRetention(workspaceRoot, { now });

    expect(firstPlan).toEqual({
      policy: {
        maxAgeMs: 14 * 24 * 60 * 60 * 1000,
        maxBytes: 256 * 1024 * 1024,
        maxRuns: 40,
      },
      runs: [
        {
          manifestDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
          runPath: 'runs/run_01',
        },
      ],
    });
    expect(JSON.stringify(secondPlan)).toBe(JSON.stringify(firstPlan));
  });
});

test('applies age and byte bounds only after preserving the newest ten runs', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    for (let sequence = 1; sequence <= 12; sequence += 1) {
      await createCompletedRun(
        workspaceRoot,
        sequence,
        new Date(oldAt.getTime() + sequence * 1000),
      );
    }

    const agePlan = await planContextRetention(workspaceRoot, {
      maxAgeMs: 0,
      maxBytes: 256 * 1024 * 1024,
      maxRuns: 40,
      now,
    });
    const bytePlan = await planContextRetention(workspaceRoot, {
      maxAgeMs: 14 * 24 * 60 * 60 * 1000,
      maxBytes: 0,
      maxRuns: 40,
      now,
    });

    expect(agePlan.runs.map((run) => run.runPath)).toEqual(['runs/run_02', 'runs/run_01']);
    expect(bytePlan.runs.map((run) => run.runPath)).toEqual(['runs/run_02', 'runs/run_01']);
  });
});

test('ignores malformed and temporary generations, symlink runs, and recently observed runs', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    for (let sequence = 1; sequence <= 13; sequence += 1) {
      await createCompletedRun(
        workspaceRoot,
        sequence,
        new Date(oldAt.getTime() + sequence * 1000),
      );
    }
    const malformedContextId = 'context_run_01';
    const malformedGenerationRoot = path.dirname(
      generationPath(workspaceRoot, 'run_01', malformedContextId),
    );
    await writeFile(path.join(malformedGenerationRoot, '0000000002-broken.json'), '{broken');
    await writeFile(path.join(malformedGenerationRoot, '.pending.tmp'), 'temporary');
    await createCompletedRun(workspaceRoot, 14, new Date(now.getTime() - 30 * 60 * 1000));

    const externalRun = path.join(workspaceRoot, 'external-run');
    await mkdir(externalRun);
    await symlink(externalRun, path.join(storeRoot(workspaceRoot), 'runs', 'run_link'), 'dir');

    const plan = await planContextRetention(workspaceRoot, {
      maxAgeMs: 14 * 24 * 60 * 60 * 1000,
      maxBytes: 256 * 1024 * 1024,
      maxRuns: 10,
      now,
    });

    expect(plan.runs.map((run) => run.runPath)).not.toEqual(
      expect.arrayContaining(['runs/run_01', 'runs/run_14', 'runs/run_link']),
    );
    expect(plan.runs.map((run) => run.runPath)).toEqual(['runs/run_03', 'runs/run_02']);
  });
});

test('refuses a context store whose canonical root escapes the workspace', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const externalStore = await mkdtemp(path.join(os.tmpdir(), 'rstack-external-context-store-'));
    try {
      await mkdir(path.join(workspaceRoot, '.rstack', 'cache'), {
        recursive: true,
      });
      await symlink(
        externalStore,
        path.join(workspaceRoot, '.rstack', 'cache', 'context-v1'),
        'dir',
      );

      await expect(planContextRetention(workspaceRoot, { now })).resolves.toEqual({
        policy: {
          maxAgeMs: 14 * 24 * 60 * 60 * 1000,
          maxBytes: 256 * 1024 * 1024,
          maxRuns: 40,
        },
        runs: [],
      });
    } finally {
      await rm(externalStore, { force: true, recursive: true });
    }
  });
});

test('deletes only exact selected run directories and leaves store roots intact', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    for (let sequence = 1; sequence <= 12; sequence += 1) {
      await createCompletedRun(
        workspaceRoot,
        sequence,
        new Date(oldAt.getTime() + sequence * 1000),
      );
    }
    const plan = await planContextRetention(workspaceRoot, {
      maxAgeMs: 14 * 24 * 60 * 60 * 1000,
      maxBytes: 256 * 1024 * 1024,
      maxRuns: 10,
      now,
    });

    await expect(applyContextRetention(workspaceRoot, plan)).resolves.toEqual({
      deleted: ['runs/run_02', 'runs/run_01'],
      skipped: [],
    });
    await expect(stat(storeRoot(workspaceRoot))).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    });
    await expect(stat(path.join(storeRoot(workspaceRoot), 'runs'))).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    });
    await expect(stat(runRoot(workspaceRoot, 'run_01'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(stat(runRoot(workspaceRoot, 'run_02'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(stat(runRoot(workspaceRoot, 'run_12'))).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    });
  });
});

test('skips missing, changed, and symlinked runs when applying a stale plan', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const runs = await Promise.all(
      Array.from({ length: 13 }, async (_, index) =>
        createCompletedRun(
          workspaceRoot,
          index + 1,
          new Date(oldAt.getTime() + (index + 1) * 1000),
        ),
      ),
    );
    const plan = await planContextRetention(workspaceRoot, {
      maxAgeMs: 14 * 24 * 60 * 60 * 1000,
      maxBytes: 256 * 1024 * 1024,
      maxRuns: 10,
      now,
    });
    const changedRun = runs[2]!;
    await writeFile(
      manifestPath(workspaceRoot, changedRun.runId),
      `${JSON.stringify({ ...changedRun, command: 'changed' })}\n`,
    );
    await utimes(manifestPath(workspaceRoot, changedRun.runId), oldAt, oldAt);
    await rm(runRoot(workspaceRoot, 'run_02'), {
      force: true,
      recursive: true,
    });
    const externalRun = path.join(workspaceRoot, 'external-run');
    await mkdir(externalRun);
    await rm(runRoot(workspaceRoot, 'run_01'), {
      force: true,
      recursive: true,
    });
    await symlink(externalRun, runRoot(workspaceRoot, 'run_01'), 'dir');

    await expect(applyContextRetention(workspaceRoot, plan)).resolves.toEqual({
      deleted: [],
      skipped: ['runs/run_03', 'runs/run_02', 'runs/run_01'],
    });
    await expect(lstat(runRoot(workspaceRoot, 'run_01'))).resolves.toMatchObject({
      isSymbolicLink: expect.any(Function),
    });
  });
});
