/* rslint-disable @typescript-eslint/no-unsafe-assignment -- Rstest asymmetric matchers are intentionally untyped. */
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@rstest/core';
import {
  contextStoreSchemaVersion,
  readProjectStatus,
  writeContextRunManifest,
  writeContextSnapshot,
  type ContextDescriptor,
  type ContextRunManifest,
  type ContextSnapshot,
} from '../src/index.ts';

const withTempWorkspace = async (
  callback: (workspaceRoot: string) => Promise<void>,
): Promise<void> => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-context-status-'));

  try {
    await callback(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
};

const createRun = (
  runId: string,
  producer: ContextRunManifest['producer'],
  startedAt: string,
  context: ContextDescriptor,
): ContextRunManifest => ({
  schemaVersion: contextStoreSchemaVersion,
  runId,
  producer,
  command: 'build',
  startedAt,
  contexts: [context],
});

test('returns a stable anonymous status for an empty standalone store', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const status = await readProjectStatus(workspaceRoot);

    expect(status).toEqual({
      schemaVersion: contextStoreSchemaVersion,
      workspaceId: expect.stringMatching(/^ws_[0-9a-f]{24}$/u),
      contexts: [],
      issues: [],
    });
    expect(JSON.stringify(status)).not.toContain(workspaceRoot);
  });
});

test('projects only the latest run for each context in deterministic order', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await mkdir(path.join(workspaceRoot, 'packages', 'app'), {
      recursive: true,
    });
    await mkdir(path.join(workspaceRoot, 'packages', 'library'), {
      recursive: true,
    });

    const appContext = {
      contextId: 'ctx_app',
      packageRoot: 'packages/app',
      product: 'application',
      environment: 'web',
    } as const;
    const libraryContext = {
      contextId: 'ctx_library',
      packageRoot: 'packages/library',
      product: 'library',
      environment: 'esm',
    } as const;
    const firstAppRun = createRun('run_app_a', 'rsbuild', '2026-08-12T04:00:00.000Z', appContext);
    const secondAppRun = createRun('run_app_b', 'rsbuild', '2026-08-12T06:00:00.000Z', appContext);
    const firstLibraryRun = createRun(
      'run_library_a',
      'rslib',
      '2026-08-12T05:00:00.000Z',
      libraryContext,
    );
    const secondLibraryRun = createRun(
      'run_library_b',
      'rslib',
      '2026-08-12T05:00:00.000Z',
      libraryContext,
    );
    const appSnapshot = {
      schemaVersion: contextStoreSchemaVersion,
      snapshotId: 'snap_app_a',
      runId: firstAppRun.runId,
      contextId: appContext.contextId,
      sequence: 1,
      observedAt: '2026-08-12T04:00:01.000Z',
      status: 'pass',
      completeness: { build: 'complete' },
      facets: { summary: { errors: 0 } },
    } satisfies ContextSnapshot;
    const librarySnapshot = {
      schemaVersion: contextStoreSchemaVersion,
      snapshotId: 'snap_library_b',
      runId: secondLibraryRun.runId,
      contextId: libraryContext.contextId,
      sequence: 1,
      observedAt: '2026-08-12T05:00:01.000Z',
      status: 'pass',
      completeness: { build: 'complete' },
      facets: { summary: { errors: 0 } },
    } satisfies ContextSnapshot;

    expect(await writeContextRunManifest(workspaceRoot, firstAppRun)).toMatchObject({
      written: true,
    });
    expect(await writeContextRunManifest(workspaceRoot, firstLibraryRun)).toMatchObject({
      written: true,
    });
    expect(await writeContextRunManifest(workspaceRoot, secondLibraryRun)).toMatchObject({
      written: true,
    });
    expect(await writeContextRunManifest(workspaceRoot, secondAppRun)).toMatchObject({
      written: true,
    });
    expect(await writeContextSnapshot(workspaceRoot, appSnapshot)).toMatchObject({
      written: true,
    });
    expect(await writeContextSnapshot(workspaceRoot, librarySnapshot)).toMatchObject({
      written: true,
    });

    const status = await readProjectStatus(workspaceRoot);

    expect(status.contexts).toEqual([
      {
        runId: secondAppRun.runId,
        producer: secondAppRun.producer,
        context: appContext,
        state: 'pending',
      },
      {
        runId: secondLibraryRun.runId,
        producer: secondLibraryRun.producer,
        context: libraryContext,
        state: 'ready',
        latestSnapshot: librarySnapshot,
        freshness: { state: 'unknown', changedPaths: [] },
      },
    ]);
    expect(JSON.stringify(status)).not.toContain(workspaceRoot);
  });
});
