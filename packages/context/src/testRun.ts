import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { RunRstestOptions, TestRunResult } from '@rstest/core/api';
import {
  contextStoreSchemaVersion,
  type ContextFreshness,
  type ContextRunStatus,
  type ContextSnapshot,
  type JsonValue,
  type TestCaseRecord,
  type TestErrorRecord,
  type TestFacet,
  type TestFileRecord,
} from './model.ts';
import {
  normalizeExecutionFacet,
  unavailableExecutionFacet,
  validateExecutionRequest,
  type TestExecutionRequest,
} from './execution.ts';
import {
  assessSnapshotFreshness,
  createExplicitContextDescriptor,
  createExplicitRun,
  recordContextInputFiles,
  resolveExplicitCaptureTarget,
  resolveInternalConfigPath,
  type ConfigTargetRunner,
} from './source.ts';
import {
  readContextSnapshotById,
  readContextSnapshots,
  writeContextRunManifest,
  writeContextSnapshot,
} from './store.ts';

type TestSnapshotRequest = {
  files?: string[];
  related?: string[];
  testNamePattern?: string;
  packageRoot?: string;
  configPath?: string;
  execution?: TestExecutionRequest;
};

type TestResultsQuery = {
  snapshotId?: string;
  project?: string;
  pathPrefix?: string;
  status?: TestCaseRecord['status'];
  limit?: number;
  cursor?: string;
};

type TestResultPage = {
  producer: 'rstest';
  contextId: string;
  snapshotId: string;
  observedAt: string;
  completeness: ContextSnapshot['completeness'];
  freshness: ContextFreshness;
  total: number;
  items: TestCaseRecord[];
  nextCursor?: string;
};

type TestCaptureResult = {
  runId: string;
  contextId: string;
  snapshotId: string;
  status: ContextRunStatus;
  freshness: ContextFreshness;
  summary: Record<string, number>;
};

type RunRstest = (options?: RunRstestOptions) => Promise<TestRunResult>;

type RelatedTestRequest = {
  packageRoot: string;
  configPath?: string;
  sources: string[];
};

type ResolveRelatedTests = (request: RelatedTestRequest) => Promise<string[]>;

type TestCaptureDependencies = {
  runRstest?: RunRstest;
  createRunId?: () => string;
  createSnapshotId?: () => string;
  now?: () => Date;
  wrapperConfigPath?: string;
  withConfigTarget?: ConfigTargetRunner;
  resolveRelatedTests?: ResolveRelatedTests;
};

const toWorkspacePath = (workspaceRoot: string, filePath: string): string =>
  path.relative(workspaceRoot, path.resolve(workspaceRoot, filePath)).split(path.sep).join('/');

const optionalString = <K extends keyof TestErrorRecord>(
  key: K,
  value: TestErrorRecord[K] | undefined,
): Pick<TestErrorRecord, K> | Record<string, never> =>
  value === undefined ? {} : ({ [key]: value } as Pick<TestErrorRecord, K>);

const normalizeError = (error: TestRunResult['unhandledErrors'][number]): TestErrorRecord => ({
  name: error.name,
  message: error.message,
  ...optionalString('stack', error.stack),
  ...optionalString('diff', error.diff),
  ...optionalString('actual', error.actual),
  ...optionalString('expected', error.expected),
  ...(error.retryCount === undefined ? {} : { retryCount: error.retryCount }),
});

const compareTestCases = (left: TestCaseRecord, right: TestCaseRecord): number =>
  left.project.localeCompare(right.project) ||
  left.path.localeCompare(right.path) ||
  (left.parentNames ?? []).join('\u0000').localeCompare((right.parentNames ?? []).join('\u0000')) ||
  left.name.localeCompare(right.name);

const normalizeTestCase = (
  workspaceRoot: string,
  result: TestRunResult['files'][number]['results'][number],
): TestCaseRecord => ({
  project: result.project,
  path: toWorkspacePath(workspaceRoot, result.testPath),
  name: result.name,
  ...(result.parentNames === undefined ? {} : { parentNames: [...result.parentNames] }),
  status: result.status,
  ...(result.duration === undefined ? {} : { durationMs: result.duration }),
  ...(result.errors === undefined ? {} : { errors: result.errors.map(normalizeError) }),
  ...(result.retryErrors === undefined
    ? {}
    : { retryErrors: result.retryErrors.map(normalizeError) }),
  ...(result.retryCount === undefined ? {} : { retryCount: result.retryCount }),
});

const normalizeTestFile = (
  workspaceRoot: string,
  result: TestRunResult['files'][number],
): TestFileRecord => ({
  project: result.project,
  path: toWorkspacePath(workspaceRoot, result.testPath),
  status: result.status,
  ...(result.duration === undefined ? {} : { durationMs: result.duration }),
  ...(result.errors === undefined ? {} : { errors: result.errors.map(normalizeError) }),
  tests: result.results
    .map((testResult) => normalizeTestCase(workspaceRoot, testResult))
    .sort(compareTestCases),
});

const normalizeTestFacet = (
  workspaceRoot: string,
  result: TestRunResult,
  relation?: TestFacet['relation'],
): TestFacet => ({
  producer: 'rstest',
  ...(relation === undefined ? {} : { relation }),
  files: result.files
    .map((fileResult) => normalizeTestFile(workspaceRoot, fileResult))
    .sort(
      (left, right) =>
        left.project.localeCompare(right.project) || left.path.localeCompare(right.path),
    ),
  stats: {
    tests: { ...result.stats.tests },
    files: { ...result.stats.files },
  },
  durationMs: result.duration.total,
  unhandledErrors: result.unhandledErrors.map(normalizeError),
});

const testCaptureSelection = (request: TestSnapshotRequest): JsonValue => ({
  ...(request.files === undefined
    ? {}
    : { files: [...new Set(request.files)].sort((left, right) => left.localeCompare(right)) }),
  ...(request.related === undefined
    ? {}
    : { related: [...new Set(request.related)].sort((left, right) => left.localeCompare(right)) }),
  ...(request.testNamePattern === undefined ? {} : { testNamePattern: request.testNamePattern }),
});

const getRunStatus = (result: TestRunResult): ContextRunStatus => {
  if (result.unhandledErrors.length > 0) return 'error';
  return result.ok ? 'pass' : 'fail';
};

const ensureWritten = (result: Awaited<ReturnType<typeof writeContextSnapshot>>): void => {
  if (!result.written) throw result.error;
};

const loadRunRstest = async (): Promise<RunRstest> => (await import('@rstest/core/api')).runRstest;

const validateRelatedSelection = (request: TestSnapshotRequest): void => {
  if (request.files !== undefined && request.related !== undefined) {
    throw new Error('files and related cannot be used together.');
  }
  if (
    request.related !== undefined &&
    (request.related.length === 0 ||
      request.related.length > 200 ||
      request.related.some((source) => source.length === 0))
  ) {
    throw new Error('related must contain from 1 to 200 non-empty source paths.');
  }
};

const emptyTestRunResult = (): TestRunResult => ({
  ok: true,
  files: [],
  stats: {
    tests: { total: 0, passed: 0, failed: 0, skipped: 0, todo: 0 },
    files: { total: 0, failed: 0 },
  },
  unhandledErrors: [],
  duration: { total: 0 },
});

const captureTestSnapshot = async (
  workspaceRoot: string,
  request: TestSnapshotRequest,
  dependencies: TestCaptureDependencies = {},
): Promise<TestCaptureResult> => {
  validateExecutionRequest(request.execution);
  validateRelatedSelection(request);
  const target = await resolveExplicitCaptureTarget(workspaceRoot, request);
  const wrapperConfigPath =
    dependencies.wrapperConfigPath ??
    resolveInternalConfigPath(import.meta.dirname, 'rstestConfig.js');
  const context = createExplicitContextDescriptor({
    producer: 'rstest',
    workspaceRoot,
    ...target,
  });
  const captureSelection = testCaptureSelection(request);
  const now = dependencies.now ?? (() => new Date());
  const run = createExplicitRun({
    producer: 'rstest',
    command: 'test',
    context,
    createRunId: dependencies.createRunId,
    now,
  });
  ensureWritten(await writeContextRunManifest(workspaceRoot, run));
  let result: TestRunResult | undefined;
  let relation: TestFacet['relation'];
  try {
    let selectedFiles = request.files;
    if (request.related !== undefined) {
      if (dependencies.resolveRelatedTests === undefined) {
        throw new Error('Rstack test capture requires a related-test resolver.');
      }
      const sourceFiles = [
        ...new Set(request.related.map((source) => path.resolve(target.packageRoot, source))),
      ];
      const testFiles = [
        ...new Set(
          await dependencies.resolveRelatedTests({
            packageRoot: target.packageRoot,
            configPath: target.configPath,
            sources: sourceFiles,
          }),
        ),
      ];
      relation = {
        sources: sourceFiles.map((source) => toWorkspacePath(workspaceRoot, source)).sort(),
        testFiles: testFiles.map((file) => toWorkspacePath(workspaceRoot, file)).sort(),
      };
      selectedFiles = testFiles.map((file) => toWorkspacePath(target.packageRoot, file));
      if (selectedFiles.length === 0) result = emptyTestRunResult();
    }

    if (result === undefined) {
      const runRstest = dependencies.runRstest ?? (await loadRunRstest());
      const withConfigTarget =
        dependencies.withConfigTarget ??
        (async (_configRoot, _configPath, action) => {
          if (dependencies.runRstest === undefined) {
            throw new Error('Rstack test capture requires a config adapter.');
          }
          return action();
        });
      result = await withConfigTarget(target.packageRoot, target.configPath, () =>
        runRstest({
          cwd: target.packageRoot,
          config: wrapperConfigPath,
          ...(request.execution === undefined
            ? {}
            : {
                inlineConfig: {
                  coverage: {
                    enabled: true,
                    provider: 'istanbul' as const,
                    reporters: [],
                    reportOnFailure: true,
                    ...(request.execution.include === undefined
                      ? {}
                      : { include: request.execution.include }),
                    ...(request.execution.exclude === undefined
                      ? {}
                      : { exclude: request.execution.exclude }),
                    allowExternal: request.execution.allowExternal ?? false,
                  },
                },
              }),
          ...(selectedFiles === undefined ? {} : { files: selectedFiles }),
          ...(request.testNamePattern === undefined
            ? {}
            : { testNamePattern: request.testNamePattern }),
        }),
      );
    }
  } catch (error) {
    const capturedError: TestErrorRecord =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            ...optionalString('stack', error.stack),
          }
        : { name: 'Error', message: String(error) };
    const facet: TestFacet = {
      producer: 'rstest',
      files: [],
      stats: {
        tests: { total: 0, passed: 0, failed: 0, skipped: 0, todo: 0 },
        files: { total: 0, failed: 0 },
      },
      durationMs: 0,
      unhandledErrors: [capturedError],
    };
    const executionFacet =
      request.execution === undefined ? undefined : unavailableExecutionFacet(request.execution);
    const snapshot: ContextSnapshot = {
      schemaVersion: contextStoreSchemaVersion,
      snapshotId: dependencies.createSnapshotId?.() ?? `snap_${Date.now()}_${randomUUID()}`,
      runId: run.runId,
      contextId: context.contextId,
      sequence: 0,
      observedAt: now().toISOString(),
      status: 'error',
      completeness: {
        test: 'partial',
        ...(executionFacet === undefined ? {} : { execution: 'partial' }),
      },
      facets: {
        test: facet as unknown as JsonValue,
        ...(executionFacet === undefined
          ? {}
          : { execution: executionFacet as unknown as JsonValue }),
      },
      source: { inputs: [], inputCompleteness: 'partial', captureSelection },
    };

    ensureWritten(await writeContextSnapshot(workspaceRoot, snapshot));
    throw error;
  }
  const facet = normalizeTestFacet(workspaceRoot, result, relation);
  const executionFacet =
    request.execution === undefined
      ? undefined
      : await normalizeExecutionFacet(
          workspaceRoot,
          target.packageRoot,
          request.execution,
          result.coverage,
        );
  const testInputs = await recordContextInputFiles(workspaceRoot, [
    ...new Set([
      ...facet.files.map((file) => file.path),
      ...(facet.relation?.sources ?? []),
      ...(facet.relation?.testFiles ?? []),
    ]),
  ]);
  const executionInputs =
    executionFacet?.files.flatMap((file) =>
      file.digest === undefined ? [] : [{ path: file.path, digest: file.digest }],
    ) ?? [];
  const inputs = [
    ...new Map([...testInputs, ...executionInputs].map((input) => [input.path, input])).values(),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const snapshot: ContextSnapshot = {
    schemaVersion: contextStoreSchemaVersion,
    snapshotId: dependencies.createSnapshotId?.() ?? `snap_${Date.now()}_${randomUUID()}`,
    runId: run.runId,
    contextId: context.contextId,
    sequence: 0,
    observedAt: now().toISOString(),
    status: getRunStatus(result),
    completeness: {
      test: 'complete',
      ...(executionFacet === undefined
        ? {}
        : {
            execution:
              executionFacet.availability === 'available' &&
              executionFacet.universe.completeness === 'complete'
                ? 'complete'
                : 'partial',
          }),
    },
    facets: {
      test: facet as unknown as JsonValue,
      ...(executionFacet === undefined
        ? {}
        : { execution: executionFacet as unknown as JsonValue }),
    },
    source: { inputs, inputCompleteness: 'partial', captureSelection },
  };

  ensureWritten(await writeContextSnapshot(workspaceRoot, snapshot));
  return {
    runId: run.runId,
    contextId: context.contextId,
    snapshotId: snapshot.snapshotId,
    status: snapshot.status,
    freshness: await assessSnapshotFreshness(workspaceRoot, snapshot),
    summary: {
      files: facet.stats.files.total,
      failedFiles: facet.stats.files.failed,
      tests: facet.stats.tests.total,
      failedTests: facet.stats.tests.failed,
      unhandledErrors: facet.unhandledErrors.length,
    },
  };
};

const decodeCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) return 0;
  const value = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) throw new Error('Invalid test result cursor.');
  return Number(value);
};

const encodeCursor = (offset: number): string => Buffer.from(String(offset)).toString('base64url');

const listTestResults = async (
  workspaceRoot: string,
  query: TestResultsQuery,
): Promise<TestResultPage> => {
  const stored =
    query.snapshotId === undefined
      ? (await readContextSnapshots(workspaceRoot, { producer: 'rstest' })).find(
          ({ snapshot }) => snapshot.facets.test !== undefined,
        )
      : await readContextSnapshotById(workspaceRoot, query.snapshotId);
  if (stored === undefined || stored.run.producer !== 'rstest') {
    throw new Error('Rstest snapshot not found.');
  }
  const facet = stored.snapshot.facets.test as unknown as TestFacet | undefined;
  if (facet?.producer !== 'rstest') throw new Error('Rstest snapshot has no test facet.');

  const items = facet.files
    .flatMap((file) => file.tests)
    .filter(
      (item) =>
        (query.project === undefined || item.project === query.project) &&
        (query.pathPrefix === undefined || item.path.startsWith(query.pathPrefix)) &&
        (query.status === undefined || item.status === query.status),
    )
    .sort(compareTestCases);
  const offset = decodeCursor(query.cursor);
  const limit = query.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('Test result limit must be an integer from 1 to 200.');
  }
  const pageItems = items.slice(offset, offset + limit);
  const nextOffset = offset + pageItems.length;
  return {
    producer: 'rstest',
    contextId: stored.snapshot.contextId,
    snapshotId: stored.snapshot.snapshotId,
    observedAt: stored.snapshot.observedAt,
    completeness: stored.snapshot.completeness,
    freshness: await assessSnapshotFreshness(workspaceRoot, stored.snapshot),
    total: items.length,
    items: pageItems,
    ...(nextOffset < items.length ? { nextCursor: encodeCursor(nextOffset) } : {}),
  };
};

export { captureTestSnapshot, listTestResults };
export type {
  TestCaptureDependencies,
  TestCaptureResult,
  RelatedTestRequest,
  ResolveRelatedTests,
  TestResultPage,
  TestResultsQuery,
  TestSnapshotRequest,
};
