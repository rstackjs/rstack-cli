import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import {
  contextStoreSchemaVersion,
  readContextWorkspaceStatus,
  writeContextRunManifest,
  writeContextSnapshot,
  type ContextRunManifest,
  type ContextSnapshot,
} from '../../src/context/index.ts';

const context = {
  contextId: 'ctx_library_esm',
  packageName: '@repo/library',
  packageRoot: 'packages/library',
  configPath: 'packages/library/rstack.config.ts',
  product: 'library',
  environment: 'esm',
} as const;

const run: ContextRunManifest = {
  schemaVersion: contextStoreSchemaVersion,
  runId: 'run_library_watch',
  producer: 'rslib',
  command: 'build:watch',
  startedAt: '2026-08-12T05:00:00.000Z',
  contexts: [context],
};

const firstSnapshot: ContextSnapshot = {
  schemaVersion: contextStoreSchemaVersion,
  snapshotId: 'snap_library_1',
  runId: run.runId,
  contextId: context.contextId,
  sequence: 1,
  observedAt: '2026-08-12T05:00:01.000Z',
  status: 'pass',
  completeness: { build: 'complete' },
  facets: { summary: { errors: 0, warnings: 0 } },
};

const secondSnapshot: ContextSnapshot = {
  ...firstSnapshot,
  snapshotId: 'snap_library_2',
  sequence: 2,
  observedAt: '2026-08-12T05:00:02.000Z',
  facets: { summary: { errors: 0, warnings: 1 } },
};

const withTempWorkspace = async (
  callback: (workspaceRoot: string) => Promise<void>,
): Promise<void> => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-context-store-'));

  try {
    await callback(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
};

test('publishes immutable run snapshots and reads the latest context state', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    expect(await writeContextRunManifest(workspaceRoot, run)).toMatchObject({
      written: true,
    });
    expect(await writeContextSnapshot(workspaceRoot, firstSnapshot)).toMatchObject({
      written: true,
    });
    expect(await writeContextSnapshot(workspaceRoot, secondSnapshot)).toMatchObject({
      written: true,
    });

    await expect(readContextWorkspaceStatus(workspaceRoot)).resolves.toEqual({
      schemaVersion: contextStoreSchemaVersion,
      runs: [
        {
          run,
          contexts: [{ context, latestSnapshot: secondSnapshot }],
        },
      ],
      issues: [],
    });

    const cacheRoot = path.join(workspaceRoot, '.rstack', 'cache');
    expect(await readFile(path.join(cacheRoot, '.gitignore'), 'utf8')).toBe('*\n');
    expect(
      (await readdir(path.join(cacheRoot, 'context-v1'), { recursive: true })).sort(),
    ).not.toEqual(expect.arrayContaining([expect.stringMatching(/\.tmp$/u)]));
  });
});

test('does not replace an immutable snapshot record', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeContextRunManifest(workspaceRoot, run);
    expect(await writeContextSnapshot(workspaceRoot, firstSnapshot)).toMatchObject({
      written: true,
    });

    const replacement = {
      ...firstSnapshot,
      facets: { summary: { errors: 42 } },
    } satisfies ContextSnapshot;
    expect(await writeContextSnapshot(workspaceRoot, replacement)).toMatchObject({
      written: false,
    });

    const status = await readContextWorkspaceStatus(workspaceRoot);
    expect(status.runs[0]?.contexts[0]?.latestSnapshot).toEqual(firstSnapshot);
  });
});

test('reports malformed completed records and ignores temporary files', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeContextRunManifest(workspaceRoot, run);
    await writeContextSnapshot(workspaceRoot, firstSnapshot);
    const generationRoot = path.join(
      workspaceRoot,
      '.rstack',
      'cache',
      'context-v1',
      'runs',
      run.runId,
      'contexts',
      context.contextId,
      'generations',
    );
    await mkdir(generationRoot, { recursive: true });
    await writeFile(path.join(generationRoot, '0000000002-broken.json'), '{broken');
    await writeFile(path.join(generationRoot, '.pending.tmp'), '{broken');

    const status = await readContextWorkspaceStatus(workspaceRoot);
    expect(status.issues).toEqual([
      {
        code: 'invalid-record',
        path: path.posix.join(
          'runs',
          run.runId,
          'contexts',
          context.contextId,
          'generations',
          '0000000002-broken.json',
        ),
      },
    ]);
    expect(status.runs[0]?.contexts[0]?.latestSnapshot).toEqual(firstSnapshot);
  });
});

test('uses the same manifest validation when writing and reading', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const invalidRun = {
      ...run,
      contexts: [context, { ...context, packageRoot: 'packages/other' }],
    };
    expect(
      await writeContextRunManifest(workspaceRoot, invalidRun as ContextRunManifest),
    ).toMatchObject({ written: false });

    const runRoot = path.join(workspaceRoot, '.rstack', 'cache', 'context-v1', 'runs', run.runId);
    await mkdir(runRoot, { recursive: true });
    await writeFile(path.join(runRoot, 'run.json'), JSON.stringify(invalidRun));

    const status = await readContextWorkspaceStatus(workspaceRoot);
    expect(status.issues).toEqual([
      {
        code: 'invalid-record',
        path: path.posix.join('runs', run.runId, 'run.json'),
      },
    ]);
  });
});

test('uses the same snapshot validation when writing and reading', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeContextRunManifest(workspaceRoot, run);
    const invalidSnapshot = { ...firstSnapshot, status: 'unknown' };
    expect(
      await writeContextSnapshot(workspaceRoot, invalidSnapshot as ContextSnapshot),
    ).toMatchObject({ written: false });

    const generationRoot = path.join(
      workspaceRoot,
      '.rstack',
      'cache',
      'context-v1',
      'runs',
      run.runId,
      'contexts',
      context.contextId,
      'generations',
    );
    const fileName = '0000000001-snap_library_1.json';
    await mkdir(generationRoot, { recursive: true });
    await writeFile(path.join(generationRoot, fileName), JSON.stringify(invalidSnapshot));

    const status = await readContextWorkspaceStatus(workspaceRoot);
    expect(status.issues).toEqual([
      {
        code: 'invalid-record',
        path: path.posix.join(
          'runs',
          run.runId,
          'contexts',
          context.contextId,
          'generations',
          fileName,
        ),
      },
    ]);
  });
});

test('rejects snapshot records stored under a noncanonical generation name', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeContextRunManifest(workspaceRoot, run);
    const generationRoot = path.join(
      workspaceRoot,
      '.rstack',
      'cache',
      'context-v1',
      'runs',
      run.runId,
      'contexts',
      context.contextId,
      'generations',
    );
    const fileName = '0000000009-snap_library_1.json';
    await mkdir(generationRoot, { recursive: true });
    await writeFile(path.join(generationRoot, fileName), JSON.stringify(firstSnapshot));

    const status = await readContextWorkspaceStatus(workspaceRoot);
    expect(status.issues).toEqual([
      {
        code: 'invalid-record',
        path: path.posix.join(
          'runs',
          run.runId,
          'contexts',
          context.contextId,
          'generations',
          fileName,
        ),
      },
    ]);
    expect(status.runs[0]?.contexts[0]?.latestSnapshot).toBeUndefined();
  });
});

test('stops reading generations after the newest valid snapshot', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeContextRunManifest(workspaceRoot, run);
    const latestSnapshot = {
      ...secondSnapshot,
      snapshotId: 'snap_library_4',
      sequence: 4,
    } satisfies ContextSnapshot;
    await writeContextSnapshot(workspaceRoot, {
      ...secondSnapshot,
      snapshotId: 'snap_library_2',
      sequence: 2,
    });
    await writeContextSnapshot(workspaceRoot, {
      ...secondSnapshot,
      snapshotId: 'snap_library_3',
      sequence: 3,
    });
    await writeContextSnapshot(workspaceRoot, latestSnapshot);

    const generationRoot = path.join(
      workspaceRoot,
      '.rstack',
      'cache',
      'context-v1',
      'runs',
      run.runId,
      'contexts',
      context.contextId,
      'generations',
    );
    await writeFile(path.join(generationRoot, '0000000001-broken.json'), '{broken');
    await writeFile(path.join(generationRoot, '0000000005-broken.json'), '{broken');

    const status = await readContextWorkspaceStatus(workspaceRoot);
    expect(status.issues).toEqual([
      {
        code: 'invalid-record',
        path: path.posix.join(
          'runs',
          run.runId,
          'contexts',
          context.contextId,
          'generations',
          '0000000005-broken.json',
        ),
      },
    ]);
    expect(status.runs[0]?.contexts[0]?.latestSnapshot).toEqual(latestSnapshot);
  });
});

test('orders generation sequences numerically across the ten-digit boundary', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeContextRunManifest(workspaceRoot, run);
    const olderSnapshot = {
      ...secondSnapshot,
      snapshotId: 'snap_library_old',
      sequence: 9_999_999_999,
    } satisfies ContextSnapshot;
    const newerSnapshot = {
      ...secondSnapshot,
      snapshotId: 'snap_library_new',
      sequence: 10_000_000_000,
    } satisfies ContextSnapshot;
    await writeContextSnapshot(workspaceRoot, olderSnapshot);
    await writeContextSnapshot(workspaceRoot, newerSnapshot);

    const status = await readContextWorkspaceStatus(workspaceRoot);
    expect(status.runs[0]?.contexts[0]?.latestSnapshot).toEqual(newerSnapshot);
  });
});

test('breaks equal generation sequence ties by raw snapshot ID descending', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeContextRunManifest(workspaceRoot, run);
    const lowerSnapshotId = {
      ...secondSnapshot,
      snapshotId: 'snap_Z',
      sequence: 7,
    } satisfies ContextSnapshot;
    const higherSnapshotId = {
      ...secondSnapshot,
      snapshotId: 'snap_a',
      sequence: 7,
    } satisfies ContextSnapshot;
    await writeContextSnapshot(workspaceRoot, lowerSnapshotId);
    await writeContextSnapshot(workspaceRoot, higherSnapshotId);

    const status = await readContextWorkspaceStatus(workspaceRoot);
    expect(status.runs[0]?.contexts[0]?.latestSnapshot).toEqual(higherSnapshotId);
  });
});
