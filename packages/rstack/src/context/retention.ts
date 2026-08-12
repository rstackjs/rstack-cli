import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { getProjectCacheDir } from '../projectCache.ts';
import {
  contextStoreMaxRecordBytes,
  contextStoreSchemaVersion,
  type ContextCompleteness,
  type ContextDescriptor,
  type ContextProducer,
  type ContextRunManifest,
  type ContextRunStatus,
  type ContextSnapshot,
} from './model.ts';

const contextStoreDirectoryName = 'context-v1';
const gracePeriodMs = 60 * 60 * 1000;
const protectedRunCount = 10;
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

type ContextRetentionPolicy = {
  maxRuns: number;
  maxAgeMs: number;
  maxBytes: number;
  now?: Date;
};

type ContextRetentionPlan = {
  policy: Omit<ContextRetentionPolicy, 'now'>;
  runs: Array<{ runPath: string; manifestDigest: string }>;
};

type ContextRetentionResult = {
  deleted: string[];
  skipped: string[];
};

type RetentionRoots = {
  storeRoot: string;
  runsRoot: string;
};

type ObservedRun = {
  runPath: string;
  canonicalPath: string;
  manifestDigest: string;
  newestMtimeMs: number;
  bytes: number;
  device: number;
  inode: number;
};

const defaultPolicy: Omit<ContextRetentionPolicy, 'now'> = {
  maxRuns: 40,
  maxAgeMs: 14 * 24 * 60 * 60 * 1000,
  maxBytes: 256 * 1024 * 1024,
};

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
  value.contexts.every(isContextDescriptor) &&
  new Set(value.contexts.map((context) => context.contextId)).size === value.contexts.length;

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

const isContainedBy = (parentPath: string, candidatePath: string): boolean => {
  const relativePath = path.relative(parentPath, candidatePath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== '..' &&
      !path.isAbsolute(relativePath))
  );
};

const isNonNegativeSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const resolvePolicy = (
  policy: Partial<ContextRetentionPolicy> | undefined,
): { policy: Omit<ContextRetentionPolicy, 'now'>; now: Date } => {
  const resolved = {
    maxRuns: policy?.maxRuns ?? defaultPolicy.maxRuns,
    maxAgeMs: policy?.maxAgeMs ?? defaultPolicy.maxAgeMs,
    maxBytes: policy?.maxBytes ?? defaultPolicy.maxBytes,
  };
  if (
    !isNonNegativeSafeInteger(resolved.maxRuns) ||
    !isNonNegativeSafeInteger(resolved.maxAgeMs) ||
    !isNonNegativeSafeInteger(resolved.maxBytes)
  ) {
    throw new Error('Invalid context retention policy.');
  }
  const now = policy?.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error('Invalid context retention time.');
  }
  return { policy: resolved, now };
};

const resolveRetentionRoots = async (
  workspaceRoot: string,
): Promise<RetentionRoots | undefined> => {
  try {
    const canonicalWorkspaceRoot = await realpath(workspaceRoot);
    const storePath = path.join(
      getProjectCacheDir(canonicalWorkspaceRoot),
      contextStoreDirectoryName,
    );
    const storeStats = await lstat(storePath);
    if (!storeStats.isDirectory() || storeStats.isSymbolicLink()) {
      return undefined;
    }
    const storeRoot = await realpath(storePath);
    if (!isContainedBy(canonicalWorkspaceRoot, storeRoot)) {
      return undefined;
    }

    const runsPath = path.join(storeRoot, 'runs');
    const runsStats = await lstat(runsPath);
    if (!runsStats.isDirectory() || runsStats.isSymbolicLink()) {
      return undefined;
    }
    const runsRoot = await realpath(runsPath);
    if (path.dirname(runsRoot) !== storeRoot || !isContainedBy(storeRoot, runsRoot)) {
      return undefined;
    }
    return { storeRoot, runsRoot };
  } catch {
    return undefined;
  }
};

const readImmutableRecord = async (
  filePath: string,
): Promise<{ value: unknown; bytes: number; mtimeMs: number; content: Buffer } | undefined> => {
  try {
    const fileStats = await lstat(filePath);
    if (
      !fileStats.isFile() ||
      fileStats.isSymbolicLink() ||
      fileStats.size > contextStoreMaxRecordBytes
    ) {
      return undefined;
    }
    const content = await readFile(filePath);
    return {
      value: JSON.parse(content.toString('utf8')) as unknown,
      bytes: fileStats.size,
      mtimeMs: fileStats.mtimeMs,
      content,
    };
  } catch {
    return undefined;
  }
};

const readDirectNames = async (directoryPath: string): Promise<string[] | undefined> => {
  try {
    return (await readdir(directoryPath)).sort();
  } catch {
    return undefined;
  }
};

const inspectDirectRun = async (
  roots: RetentionRoots,
  runId: string,
): Promise<ObservedRun | undefined> => {
  if (!isSafeIdentifier(runId)) {
    return undefined;
  }
  try {
    const directPath = path.join(roots.runsRoot, runId);
    const runStats = await lstat(directPath);
    if (!runStats.isDirectory() || runStats.isSymbolicLink()) {
      return undefined;
    }
    const canonicalPath = await realpath(directPath);
    if (
      path.dirname(canonicalPath) !== roots.runsRoot ||
      !isContainedBy(roots.runsRoot, canonicalPath)
    ) {
      return undefined;
    }
    const rootNames = await readDirectNames(canonicalPath);
    if (
      rootNames === undefined ||
      rootNames.length !== 2 ||
      rootNames[0] !== 'contexts' ||
      rootNames[1] !== 'run.json'
    ) {
      return undefined;
    }

    const manifest = await readImmutableRecord(path.join(canonicalPath, 'run.json'));
    if (
      manifest === undefined ||
      !isContextRunManifest(manifest.value) ||
      manifest.value.runId !== runId
    ) {
      return undefined;
    }
    let bytes = manifest.bytes;
    let newestMtimeMs = manifest.mtimeMs;
    const contextsRoot = path.join(canonicalPath, 'contexts');
    const contextsStats = await lstat(contextsRoot);
    if (!contextsStats.isDirectory() || contextsStats.isSymbolicLink()) {
      return undefined;
    }
    const contextNames = await readDirectNames(contextsRoot);
    const expectedContextNames = manifest.value.contexts.map((context) => context.contextId).sort();
    if (
      contextNames === undefined ||
      contextNames.length !== expectedContextNames.length ||
      contextNames.some((name, index) => name !== expectedContextNames[index])
    ) {
      return undefined;
    }

    for (const context of manifest.value.contexts) {
      const contextRoot = path.join(contextsRoot, context.contextId);
      const contextStats = await lstat(contextRoot);
      if (!contextStats.isDirectory() || contextStats.isSymbolicLink()) {
        return undefined;
      }
      const contextNames = await readDirectNames(contextRoot);
      if (
        contextNames === undefined ||
        contextNames.length !== 1 ||
        contextNames[0] !== 'generations'
      ) {
        return undefined;
      }
      const generationsRoot = path.join(contextRoot, 'generations');
      const generationsStats = await lstat(generationsRoot);
      if (!generationsStats.isDirectory() || generationsStats.isSymbolicLink()) {
        return undefined;
      }
      const generationNames = await readDirectNames(generationsRoot);
      if (generationNames === undefined || generationNames.length === 0) {
        return undefined;
      }

      for (const generationName of generationNames) {
        if (!generationName.endsWith('.json')) {
          return undefined;
        }
        const generation = await readImmutableRecord(path.join(generationsRoot, generationName));
        if (
          generation === undefined ||
          !isContextSnapshot(generation.value) ||
          generation.value.runId !== runId ||
          generation.value.contextId !== context.contextId ||
          generationName !==
            `${generation.value.sequence.toString().padStart(10, '0')}-${generation.value.snapshotId}.json`
        ) {
          return undefined;
        }
        bytes += generation.bytes;
        newestMtimeMs = Math.max(newestMtimeMs, generation.mtimeMs);
      }
    }

    return {
      runPath: path.posix.join('runs', runId),
      canonicalPath,
      manifestDigest: createHash('sha256').update(manifest.content).digest('hex'),
      newestMtimeMs,
      bytes,
      device: runStats.dev,
      inode: runStats.ino,
    };
  } catch {
    return undefined;
  }
};

const readObservedRuns = async (roots: RetentionRoots): Promise<ObservedRun[]> => {
  const runIds = await readDirectNames(roots.runsRoot);
  if (runIds === undefined) {
    return [];
  }
  const runs: ObservedRun[] = [];
  for (const runId of runIds) {
    const run = await inspectDirectRun(roots, runId);
    if (run !== undefined) {
      runs.push(run);
    }
  }
  return runs.sort(
    (left, right) =>
      right.newestMtimeMs - left.newestMtimeMs || right.runPath.localeCompare(left.runPath),
  );
};

const planContextRetention = async (
  workspaceRoot: string,
  policy?: Partial<ContextRetentionPolicy>,
): Promise<ContextRetentionPlan> => {
  const { policy: resolvedPolicy, now } = resolvePolicy(policy);
  const roots = await resolveRetentionRoots(workspaceRoot);
  if (roots === undefined) {
    return { policy: resolvedPolicy, runs: [] };
  }

  const runs = (await readObservedRuns(roots)).filter(
    (run) => run.newestMtimeMs < now.getTime() - gracePeriodMs,
  );
  const plannedRuns: ContextRetentionPlan['runs'] = [];
  let retainedBytes = 0;
  const nowMs = now.getTime();
  for (const [index, run] of runs.entries()) {
    if (index < protectedRunCount) {
      retainedBytes += run.bytes;
      continue;
    }
    const exceedsCount = index >= resolvedPolicy.maxRuns;
    const exceedsAge = run.newestMtimeMs < nowMs - resolvedPolicy.maxAgeMs;
    const exceedsBytes = retainedBytes + run.bytes > resolvedPolicy.maxBytes;
    if (exceedsCount || exceedsAge || exceedsBytes) {
      plannedRuns.push({
        runPath: run.runPath,
        manifestDigest: run.manifestDigest,
      });
      continue;
    }
    retainedBytes += run.bytes;
  }
  return { policy: resolvedPolicy, runs: plannedRuns };
};

const readPlannedRunId = (entry: unknown): string | undefined => {
  if (
    !isObject(entry) ||
    typeof entry.runPath !== 'string' ||
    typeof entry.manifestDigest !== 'string'
  ) {
    return undefined;
  }
  const parts = entry.runPath.split('/');
  if (
    parts.length !== 2 ||
    parts[0] !== 'runs' ||
    !isSafeIdentifier(parts[1]) ||
    !/^[a-f0-9]{64}$/u.test(entry.manifestDigest)
  ) {
    return undefined;
  }
  return parts[1];
};

const rootsAreCurrent = async (roots: RetentionRoots): Promise<boolean> => {
  try {
    const storeStats = await lstat(roots.storeRoot);
    const runsStats = await lstat(roots.runsRoot);
    return (
      storeStats.isDirectory() &&
      !storeStats.isSymbolicLink() &&
      runsStats.isDirectory() &&
      !runsStats.isSymbolicLink() &&
      (await realpath(roots.runsRoot)) === roots.runsRoot
    );
  } catch {
    return false;
  }
};

const applyContextRetention = async (
  workspaceRoot: string,
  plan: ContextRetentionPlan,
): Promise<ContextRetentionResult> => {
  const deleted: string[] = [];
  const skipped: string[] = [];
  const roots = await resolveRetentionRoots(workspaceRoot);
  if (!isObject(plan) || !Array.isArray(plan.runs)) {
    return { deleted, skipped };
  }
  const seenRunPaths = new Set<string>();

  for (const plannedRun of plan.runs) {
    const runId = readPlannedRunId(plannedRun);
    if (
      runId === undefined ||
      seenRunPaths.has((plannedRun as { runPath?: string }).runPath ?? '') ||
      roots === undefined ||
      !(await rootsAreCurrent(roots))
    ) {
      if (isObject(plannedRun) && typeof plannedRun.runPath === 'string') {
        skipped.push(plannedRun.runPath);
      }
      continue;
    }
    seenRunPaths.add(plannedRun.runPath as string);
    const observedRun = await inspectDirectRun(roots, runId);
    if (
      observedRun === undefined ||
      observedRun.manifestDigest !== plannedRun.manifestDigest ||
      !(await rootsAreCurrent(roots))
    ) {
      skipped.push(plannedRun.runPath as string);
      continue;
    }
    try {
      const currentStats = await lstat(observedRun.canonicalPath);
      if (
        !currentStats.isDirectory() ||
        currentStats.isSymbolicLink() ||
        currentStats.dev !== observedRun.device ||
        currentStats.ino !== observedRun.inode ||
        path.dirname(await realpath(observedRun.canonicalPath)) !== roots.runsRoot
      ) {
        skipped.push(observedRun.runPath);
        continue;
      }
      await rm(observedRun.canonicalPath, {
        force: true,
        recursive: true,
        maxRetries: 0,
      });
      deleted.push(observedRun.runPath);
    } catch {
      skipped.push(observedRun.runPath);
    }
  }
  return { deleted, skipped };
};

export {
  applyContextRetention,
  planContextRetention,
  type ContextRetentionPlan,
  type ContextRetentionPolicy,
  type ContextRetentionResult,
};
