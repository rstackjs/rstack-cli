import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestRunResult } from '@rstest/core/api';
import { expect, test } from 'rstack/test';
import { listDiagnostics } from '../../src/context/lint.ts';
import { readProjectStatus } from '../../src/context/status.ts';
import { readContextSnapshotById } from '../../src/context/store.ts';
import {
  captureTestSnapshot,
  listTestResults,
  type TestCaptureDependencies,
  type TestSnapshotRequest,
} from '../../src/context/testRun.ts';

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
      snapshotId: capture.snapshotId,
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
      snapshotId: capture.snapshotId,
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
    'apply' | 'changed' | 'coverage' | 'related' | 'reporter' | 'shard' | 'update' | 'watch'
  >
>;

test('keeps unsupported execution controls out of snapshot requests', () => {
  const unsupportedRequestField = undefined as UnsupportedRequestFields;
  expect(unsupportedRequestField).toBeUndefined();
});
