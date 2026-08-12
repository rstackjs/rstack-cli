import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureProjectCacheDir, getProjectCacheDir } from '../projectCache.ts';
import {
  contextStoreMaxRecordBytes,
  contextStoreSchemaVersion,
  type ContextCompleteness,
  type ContextDescriptor,
  type ContextProducer,
  type ContextRunManifest,
  type ContextRunStatus,
  type ContextSnapshot,
  type ContextStoreIssue,
  type ContextStoreWriteResult,
  type ContextWorkspaceStatus,
} from './model.ts';

const contextStoreDirectoryName = 'context-v1';
const safeIdentifierPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
const producers = new Set<ContextProducer>([
  'rsbuild',
  'rspack',
  'rslib',
  'rstest',
  'rslint',
  'rsdoctor',
]);
const statuses = new Set<ContextRunStatus>([
  'queued',
  'running',
  'pass',
  'fail',
  'cancelled',
  'error',
]);
const completenessValues = new Set<ContextCompleteness>([
  'complete',
  'partial',
  'disabled',
  'unsupported',
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSafeIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && safeIdentifierPattern.test(value);

const isRelativeRecordPath = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) {
    return false;
  }
  return (
    value === '.' ||
    (!path.posix.isAbsolute(value) &&
      !value.split('/').includes('..') &&
      path.posix.normalize(value) === value)
  );
};

const isContextDescriptor = (value: unknown): value is ContextDescriptor =>
  isObject(value) &&
  isSafeIdentifier(value.contextId) &&
  isRelativeRecordPath(value.packageRoot) &&
  typeof value.product === 'string' &&
  value.product.length > 0 &&
  (value.packageName === undefined || typeof value.packageName === 'string') &&
  (value.configPath === undefined || isRelativeRecordPath(value.configPath)) &&
  (value.environment === undefined || typeof value.environment === 'string') &&
  (value.target === undefined || typeof value.target === 'string') &&
  (value.mode === undefined || typeof value.mode === 'string');

const isContextRunManifest = (value: unknown): value is ContextRunManifest =>
  isObject(value) &&
  value.schemaVersion === contextStoreSchemaVersion &&
  isSafeIdentifier(value.runId) &&
  producers.has(value.producer as ContextProducer) &&
  typeof value.command === 'string' &&
  typeof value.startedAt === 'string' &&
  Array.isArray(value.contexts) &&
  value.contexts.length > 0 &&
  value.contexts.every(isContextDescriptor);

const isCompleteness = (value: unknown): value is Record<string, ContextCompleteness> =>
  isObject(value) && Object.values(value).every((entry) => completenessValues.has(entry as never));

const isContextSnapshot = (value: unknown): value is ContextSnapshot =>
  isObject(value) &&
  value.schemaVersion === contextStoreSchemaVersion &&
  isSafeIdentifier(value.snapshotId) &&
  isSafeIdentifier(value.runId) &&
  isSafeIdentifier(value.contextId) &&
  Number.isSafeInteger(value.sequence) &&
  (value.sequence as number) >= 0 &&
  typeof value.observedAt === 'string' &&
  statuses.has(value.status as ContextRunStatus) &&
  isCompleteness(value.completeness) &&
  isObject(value.facets);

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
    `${snapshot.sequence.toString().padStart(10, '0')}-${snapshot.snapshotId}.json`,
  );

const serializeRecord = (record: unknown): string => {
  const content = `${JSON.stringify(record)}\n`;
  if (Buffer.byteLength(content) > contextStoreMaxRecordBytes) {
    throw new Error(`Context record exceeds ${contextStoreMaxRecordBytes} bytes.`);
  }
  return content;
};

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
  if (!isContextRunManifest(run)) {
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
  if (!isContextSnapshot(snapshot)) {
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
    if ((await stat(filePath)).size > contextStoreMaxRecordBytes) {
      return { status: 'issue', issue: { code: 'oversized-record', path: relativePath } };
    }
    return { status: 'value', value: JSON.parse(await readFile(filePath, 'utf8')) as unknown };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { status: 'missing' };
    }
    return { status: 'issue', issue: { code: 'invalid-record', path: relativePath } };
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
      .sort();
  } catch {
    return undefined;
  }

  let latestSnapshot: ContextSnapshot | undefined;
  for (const fileName of fileNames) {
    const relativePath = path.posix.join(relativeGenerationRoot, fileName);
    const record = await readRecord(path.join(generationRoot, fileName), relativePath);
    if (record.status === 'issue') {
      issues.push(record.issue);
      continue;
    }
    if (
      record.status !== 'value' ||
      !isContextSnapshot(record.value) ||
      record.value.runId !== run.runId ||
      record.value.contextId !== context.contextId
    ) {
      if (record.status === 'value') {
        issues.push({ code: 'invalid-record', path: relativePath });
      }
      continue;
    }
    if (
      latestSnapshot === undefined ||
      record.value.sequence > latestSnapshot.sequence ||
      (record.value.sequence === latestSnapshot.sequence &&
        record.value.snapshotId > latestSnapshot.snapshotId)
    ) {
      latestSnapshot = record.value;
    }
  }
  return latestSnapshot;
};

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
    if (!isObject(record.value) || record.value.schemaVersion !== contextStoreSchemaVersion) {
      issues.push({
        code: isObject(record.value) ? 'unsupported-schema' : 'invalid-record',
        path: relativePath,
      });
      continue;
    }
    if (!isContextRunManifest(record.value) || record.value.runId !== runId) {
      issues.push({ code: 'invalid-record', path: relativePath });
      continue;
    }

    const run = record.value;
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

export { readContextWorkspaceStatus, writeContextRunManifest, writeContextSnapshot };
