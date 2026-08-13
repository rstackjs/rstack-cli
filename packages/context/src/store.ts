import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureProjectCacheDir, getProjectCacheDir } from './cache.ts';
import {
  contextStoreSchemaVersion,
  type ContextDescriptor,
  type ContextRunManifest,
  type ContextSnapshot,
  type ContextProducer,
  type ContextStoreIssue,
  type ContextStoreWriteResult,
  type ContextWorkspaceStatus,
  type StoredContextSnapshot,
} from './model.ts';
import {
  compareContextSnapshotGenerationFileNames,
  getContextSnapshotGenerationFileName,
  isContextSnapshotGenerationFileName,
  isRecordObject,
  validateRunManifest,
  validateSnapshot,
} from './records.ts';

const contextStoreDirectoryName = 'context-v1';

const getContextStoreRoot = (workspaceRoot: string): string =>
  path.join(getProjectCacheDir(workspaceRoot), contextStoreDirectoryName);

const getRunRoot = (storeRoot: string, runId: string): string =>
  path.join(storeRoot, 'runs', runId);

const getRunManifestPath = (storeRoot: string, runId: string): string =>
  path.join(getRunRoot(storeRoot, runId), 'run.json');

const getSnapshotPath = (storeRoot: string, snapshot: ContextSnapshot): string =>
  path.join(
    getRunRoot(storeRoot, snapshot.runId),
    'contexts',
    snapshot.contextId,
    'generations',
    getContextSnapshotGenerationFileName(snapshot),
  );

const serializeRecord = (record: unknown): string => `${JSON.stringify(record)}\n`;

const publishImmutableRecord = async (
  filePath: string,
  content: string,
): Promise<ContextStoreWriteResult> => {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(temporaryPath, content, { flag: 'wx' });
    await link(temporaryPath, filePath);
    return { written: true, path: filePath };
  } catch (error) {
    return { written: false, path: filePath, error };
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
};

const unavailableWrite = (workspaceRoot: string, error: unknown): ContextStoreWriteResult => ({
  written: false,
  path: getContextStoreRoot(workspaceRoot),
  error,
});

const writeContextRunManifest = async (
  workspaceRoot: string,
  run: ContextRunManifest,
): Promise<ContextStoreWriteResult> => {
  if (validateRunManifest(run) === undefined) {
    return unavailableWrite(workspaceRoot, new Error('Invalid context run manifest.'));
  }

  try {
    const cache = await ensureProjectCacheDir(workspaceRoot);
    if (cache.status === 'unavailable') {
      return unavailableWrite(workspaceRoot, cache.error);
    }
    return publishImmutableRecord(
      getRunManifestPath(path.join(cache.path, contextStoreDirectoryName), run.runId),
      serializeRecord(run),
    );
  } catch (error) {
    return unavailableWrite(workspaceRoot, error);
  }
};

const writeContextSnapshot = async (
  workspaceRoot: string,
  snapshot: ContextSnapshot,
): Promise<ContextStoreWriteResult> => {
  if (validateSnapshot(snapshot) === undefined) {
    return unavailableWrite(workspaceRoot, new Error('Invalid context snapshot.'));
  }

  try {
    const cache = await ensureProjectCacheDir(workspaceRoot);
    if (cache.status === 'unavailable') {
      return unavailableWrite(workspaceRoot, cache.error);
    }
    return publishImmutableRecord(
      getSnapshotPath(path.join(cache.path, contextStoreDirectoryName), snapshot),
      serializeRecord(snapshot),
    );
  } catch (error) {
    return unavailableWrite(workspaceRoot, error);
  }
};

type ReadRecordResult =
  | { status: 'missing' }
  | { status: 'issue'; issue: ContextStoreIssue }
  | { status: 'value'; value: unknown };

const readRecord = async (filePath: string, relativePath: string): Promise<ReadRecordResult> => {
  try {
    return {
      status: 'value',
      value: JSON.parse(await readFile(filePath, 'utf8')) as unknown,
    };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { status: 'missing' };
    }
    return {
      status: 'issue',
      issue: { code: 'invalid-record', path: relativePath },
    };
  }
};

const readDirectoryNames = async (directoryPath: string): Promise<string[]> => {
  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
};

const readLatestSnapshot = async (
  storeRoot: string,
  run: ContextRunManifest,
  context: ContextDescriptor,
  issues: ContextStoreIssue[],
): Promise<ContextSnapshot | undefined> => {
  const relativeGenerationRoot = path.posix.join(
    'runs',
    run.runId,
    'contexts',
    context.contextId,
    'generations',
  );
  const generationRoot = path.join(storeRoot, ...relativeGenerationRoot.split('/'));
  let fileNames: string[];
  try {
    fileNames = (await readdir(generationRoot))
      .filter((fileName) => fileName.endsWith('.json'))
      .sort(compareContextSnapshotGenerationFileNames);
  } catch {
    return undefined;
  }

  for (const fileName of fileNames) {
    const relativePath = path.posix.join(relativeGenerationRoot, fileName);
    const record = await readRecord(path.join(generationRoot, fileName), relativePath);
    if (record.status === 'issue') {
      issues.push(record.issue);
      continue;
    }
    const snapshot = record.status === 'value' ? validateSnapshot(record.value) : undefined;
    if (
      snapshot === undefined ||
      snapshot.runId !== run.runId ||
      snapshot.contextId !== context.contextId ||
      !isContextSnapshotGenerationFileName(fileName, snapshot)
    ) {
      if (record.status === 'value') {
        issues.push({ code: 'invalid-record', path: relativePath });
      }
      continue;
    }
    return snapshot;
  }
  return undefined;
};

type ContextSnapshotFilters = {
  producer?: ContextProducer;
  contextId?: string;
};

const readRunSnapshots = async (
  storeRoot: string,
  run: ContextRunManifest,
): Promise<StoredContextSnapshot[]> => {
  const snapshots: StoredContextSnapshot[] = [];
  for (const context of run.contexts) {
    const generationRoot = path.join(
      getRunRoot(storeRoot, run.runId),
      'contexts',
      context.contextId,
      'generations',
    );
    let fileNames: string[];
    try {
      fileNames = (await readdir(generationRoot))
        .filter((fileName) => fileName.endsWith('.json'))
        .sort(compareContextSnapshotGenerationFileNames);
    } catch {
      continue;
    }
    for (const fileName of fileNames) {
      const record = await readRecord(path.join(generationRoot, fileName), fileName);
      const snapshot = record.status === 'value' ? validateSnapshot(record.value) : undefined;
      if (
        snapshot !== undefined &&
        snapshot.status !== 'queued' &&
        snapshot.status !== 'running' &&
        snapshot.runId === run.runId &&
        snapshot.contextId === context.contextId &&
        isContextSnapshotGenerationFileName(fileName, snapshot)
      ) {
        snapshots.push({ run, context, snapshot });
      }
    }
  }
  return snapshots;
};

const compareStoredSnapshots = (
  left: StoredContextSnapshot,
  right: StoredContextSnapshot,
): number =>
  compareDescending(left.snapshot.observedAt, right.snapshot.observedAt) ||
  compareDescending(left.run.startedAt, right.run.startedAt) ||
  compareDescending(left.snapshot.snapshotId, right.snapshot.snapshotId);

const compareDescending = (left: string, right: string): number =>
  left === right ? 0 : left > right ? -1 : 1;

const readContextSnapshots = async (
  workspaceRoot: string,
  filters: ContextSnapshotFilters = {},
): Promise<StoredContextSnapshot[]> => {
  const storeRoot = getContextStoreRoot(workspaceRoot);
  const snapshots: StoredContextSnapshot[] = [];
  for (const runId of await readDirectoryNames(path.join(storeRoot, 'runs'))) {
    const record = await readRecord(getRunManifestPath(storeRoot, runId), 'run.json');
    const run = record.status === 'value' ? validateRunManifest(record.value) : undefined;
    if (
      run === undefined ||
      run.runId !== runId ||
      (filters.producer !== undefined && run.producer !== filters.producer)
    ) {
      continue;
    }
    const runSnapshots = await readRunSnapshots(storeRoot, run);
    snapshots.push(
      ...runSnapshots.filter(
        ({ context }) => filters.contextId === undefined || context.contextId === filters.contextId,
      ),
    );
  }
  return snapshots.sort(compareStoredSnapshots);
};

const readContextSnapshotById = async (
  workspaceRoot: string,
  snapshotId: string,
): Promise<StoredContextSnapshot | undefined> =>
  (await readContextSnapshots(workspaceRoot)).find(
    ({ snapshot }) => snapshot.snapshotId === snapshotId,
  );

const readContextWorkspaceStatus = async (
  workspaceRoot: string,
): Promise<ContextWorkspaceStatus> => {
  const storeRoot = getContextStoreRoot(workspaceRoot);
  const issues: ContextStoreIssue[] = [];
  const runs = [];

  for (const runId of await readDirectoryNames(path.join(storeRoot, 'runs'))) {
    const relativePath = path.posix.join('runs', runId, 'run.json');
    const record = await readRecord(getRunManifestPath(storeRoot, runId), relativePath);
    if (record.status === 'issue') {
      issues.push(record.issue);
      continue;
    }
    if (record.status === 'missing') {
      continue;
    }
    if (!isRecordObject(record.value) || record.value.schemaVersion !== contextStoreSchemaVersion) {
      issues.push({
        code: isRecordObject(record.value) ? 'unsupported-schema' : 'invalid-record',
        path: relativePath,
      });
      continue;
    }
    const run = validateRunManifest(record.value);
    if (run === undefined || run.runId !== runId) {
      issues.push({ code: 'invalid-record', path: relativePath });
      continue;
    }

    runs.push({
      run,
      contexts: await Promise.all(
        run.contexts.map(async (context) => {
          const latestSnapshot = await readLatestSnapshot(storeRoot, run, context, issues);
          return {
            context,
            ...(latestSnapshot === undefined ? {} : { latestSnapshot }),
          };
        }),
      ),
    });
  }

  issues.sort((left, right) =>
    left.path === right.path
      ? left.code.localeCompare(right.code)
      : left.path.localeCompare(right.path),
  );
  return { schemaVersion: contextStoreSchemaVersion, runs, issues };
};

export {
  readContextSnapshotById,
  readContextSnapshots,
  readContextWorkspaceStatus,
  writeContextRunManifest,
  writeContextSnapshot,
};
export type { ContextSnapshotFilters };
