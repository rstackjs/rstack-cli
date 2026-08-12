import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, opendir, realpath, rename, rm } from 'node:fs/promises';
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
const quarantineDirectoryName = 'retention-quarantine';
const gracePeriodMs = 60 * 60 * 1000;
const protectedRunCount = 10;
const maxDirectRuns = 256;
const maxContextsPerRun = 128;
const maxGenerationsPerContext = 512;
const maxInspectedEntries = 16 * 1024;
const maxInspectedBytes = 16 * 1024 * 1024;
const maxPlanEntries = 32;
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
  runs: Array<{ runPath: string; manifestDigest: string; stateDigest: string }>;
};

type ContextRetentionResult = {
  deleted: string[];
  skipped: string[];
};

type RetentionRoots = {
  workspaceRoot: string;
  storeRoot: string;
  runsRoot: string;
  workspaceIdentity: FileIdentity;
  storeIdentity: FileIdentity;
  runsIdentity: FileIdentity;
};

type FileIdentity = { device: number; inode: number };

type ObservedRun = {
  runPath: string;
  canonicalPath: string;
  manifestDigest: string;
  stateDigest: string;
  newestMtimeMs: number;
  bytes: number;
  identity: FileIdentity;
};

type InspectionBudget = {
  bytes: number;
  entries: number;
};

type QuarantineTarget = {
  parentPath: string;
  parentIdentity: FileIdentity;
  targetPath: string;
  placeholderIdentity: FileIdentity;
};

type RetentionTestHooks = {
  beforeQuarantineRename?: (runPath: string) => Promise<void> | void;
  beforeRecordOpen?: (filePath: string) => Promise<void> | void;
};

const defaultPolicy: Omit<ContextRetentionPolicy, 'now'> = {
  maxRuns: 40,
  maxAgeMs: 14 * 24 * 60 * 60 * 1000,
  maxBytes: 256 * 1024 * 1024,
};

let retentionTestHooks: RetentionTestHooks | undefined;

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

const compareCodeUnits = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

const isContainedBy = (parentPath: string, candidatePath: string): boolean => {
  const relativePath = path.relative(parentPath, candidatePath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== '..' &&
      !path.isAbsolute(relativePath))
  );
};

const hasIdentity = (stats: { dev: number; ino: number }, identity: FileIdentity): boolean =>
  stats.dev === identity.device && stats.ino === identity.inode;

const toIdentity = (stats: { dev: number; ino: number }): FileIdentity => ({
  device: stats.dev,
  inode: stats.ino,
});

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
    const workspaceStats = await lstat(canonicalWorkspaceRoot);
    if (!workspaceStats.isDirectory() || workspaceStats.isSymbolicLink()) {
      return undefined;
    }
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
    return {
      workspaceRoot: canonicalWorkspaceRoot,
      storeRoot,
      runsRoot,
      workspaceIdentity: toIdentity(workspaceStats),
      storeIdentity: toIdentity(storeStats),
      runsIdentity: toIdentity(runsStats),
    };
  } catch {
    return undefined;
  }
};

const rootsAreCurrent = async (roots: RetentionRoots): Promise<boolean> => {
  try {
    const [workspaceStats, storeStats, runsStats] = await Promise.all([
      lstat(roots.workspaceRoot),
      lstat(roots.storeRoot),
      lstat(roots.runsRoot),
    ]);
    return (
      workspaceStats.isDirectory() &&
      !workspaceStats.isSymbolicLink() &&
      hasIdentity(workspaceStats, roots.workspaceIdentity) &&
      storeStats.isDirectory() &&
      !storeStats.isSymbolicLink() &&
      hasIdentity(storeStats, roots.storeIdentity) &&
      runsStats.isDirectory() &&
      !runsStats.isSymbolicLink() &&
      hasIdentity(runsStats, roots.runsIdentity) &&
      (await realpath(roots.storeRoot)) === roots.storeRoot &&
      (await realpath(roots.runsRoot)) === roots.runsRoot &&
      path.dirname(roots.runsRoot) === roots.storeRoot
    );
  } catch {
    return false;
  }
};

const readDirectNames = async (
  directoryPath: string,
  limit: number,
  budget: InspectionBudget,
): Promise<string[] | undefined> => {
  try {
    const directory = await opendir(directoryPath);
    const names: string[] = [];
    for await (const entry of directory) {
      budget.entries += 1;
      if (names.length >= limit || budget.entries > maxInspectedEntries) {
        return undefined;
      }
      names.push(entry.name);
    }
    return names.sort(compareCodeUnits);
  } catch {
    return undefined;
  }
};

const readImmutableRecord = async (
  filePath: string,
  budget: InspectionBudget,
): Promise<
  | {
      value: unknown;
      bytes: number;
      mtimeMs: number;
      contentDigest: string;
    }
  | undefined
> => {
  if (typeof constants.O_NOFOLLOW !== 'number') {
    return undefined;
  }
  try {
    await retentionTestHooks?.beforeRecordOpen?.(filePath);
    const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await file.stat();
      if (
        !before.isFile() ||
        before.size > contextStoreMaxRecordBytes ||
        budget.bytes + before.size > maxInspectedBytes
      ) {
        return undefined;
      }
      const content = await file.readFile();
      const after = await file.stat();
      if (
        !after.isFile() ||
        !hasIdentity(after, toIdentity(before)) ||
        after.size !== before.size ||
        content.byteLength !== before.size
      ) {
        return undefined;
      }
      budget.bytes += before.size;
      return {
        value: JSON.parse(content.toString('utf8')) as unknown,
        bytes: before.size,
        mtimeMs: before.mtimeMs,
        contentDigest: createHash('sha256').update(content).digest('hex'),
      };
    } finally {
      await file.close();
    }
  } catch {
    return undefined;
  }
};

const addDirectoryState = (
  state: string[],
  relativePath: string,
  stats: { mtimeMs: number; size: number },
): void => {
  state.push(`directory\0${relativePath}\0${stats.size}\0${stats.mtimeMs}`);
};

const addFileState = (
  state: string[],
  relativePath: string,
  record: { bytes: number; mtimeMs: number; contentDigest: string },
): void => {
  state.push(`file\0${relativePath}\0${record.bytes}\0${record.mtimeMs}\0${record.contentDigest}`);
};

const digestState = (state: string[]): string =>
  createHash('sha256').update(state.sort(compareCodeUnits).join('\n')).digest('hex');

const inspectRun = async (
  roots: RetentionRoots,
  parentPath: string,
  runId: string,
  budget: InspectionBudget,
): Promise<ObservedRun | undefined> => {
  if (!isSafeIdentifier(runId) || !(await rootsAreCurrent(roots))) {
    return undefined;
  }
  try {
    const directPath = path.join(parentPath, runId);
    const runStats = await lstat(directPath);
    if (!runStats.isDirectory() || runStats.isSymbolicLink()) {
      return undefined;
    }
    const canonicalPath = await realpath(directPath);
    if (path.dirname(canonicalPath) !== parentPath || !isContainedBy(parentPath, canonicalPath)) {
      return undefined;
    }
    const state: string[] = [];
    addDirectoryState(state, '.', runStats);
    const rootNames = await readDirectNames(canonicalPath, 2, budget);
    if (
      rootNames === undefined ||
      rootNames.length !== 2 ||
      rootNames[0] !== 'contexts' ||
      rootNames[1] !== 'run.json'
    ) {
      return undefined;
    }

    const manifest = await readImmutableRecord(path.join(canonicalPath, 'run.json'), budget);
    if (
      manifest === undefined ||
      !isContextRunManifest(manifest.value) ||
      manifest.value.runId !== runId
    ) {
      return undefined;
    }
    addFileState(state, 'run.json', manifest);
    let bytes = manifest.bytes;
    let newestMtimeMs = manifest.mtimeMs;
    const contextsRoot = path.join(canonicalPath, 'contexts');
    const contextsStats = await lstat(contextsRoot);
    if (!contextsStats.isDirectory() || contextsStats.isSymbolicLink()) {
      return undefined;
    }
    addDirectoryState(state, 'contexts', contextsStats);
    const contextNames = await readDirectNames(contextsRoot, maxContextsPerRun, budget);
    const expectedContextNames = manifest.value.contexts
      .map((context) => context.contextId)
      .sort(compareCodeUnits);
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
      addDirectoryState(state, path.posix.join('contexts', context.contextId), contextStats);
      const contextNames = await readDirectNames(contextRoot, 1, budget);
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
      const relativeGenerationRoot = path.posix.join('contexts', context.contextId, 'generations');
      addDirectoryState(state, relativeGenerationRoot, generationsStats);
      const generationNames = await readDirectNames(
        generationsRoot,
        maxGenerationsPerContext,
        budget,
      );
      if (generationNames === undefined || generationNames.length === 0) {
        return undefined;
      }

      for (const generationName of generationNames) {
        if (!generationName.endsWith('.json')) {
          return undefined;
        }
        const generation = await readImmutableRecord(
          path.join(generationsRoot, generationName),
          budget,
        );
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
        addFileState(state, path.posix.join(relativeGenerationRoot, generationName), generation);
        bytes += generation.bytes;
        newestMtimeMs = Math.max(newestMtimeMs, generation.mtimeMs);
      }
    }

    const finalStats = await lstat(directPath);
    if (
      !finalStats.isDirectory() ||
      finalStats.isSymbolicLink() ||
      !hasIdentity(finalStats, toIdentity(runStats)) ||
      (await realpath(directPath)) !== canonicalPath ||
      !(await rootsAreCurrent(roots))
    ) {
      return undefined;
    }
    return {
      runPath: path.posix.join('runs', runId),
      canonicalPath,
      manifestDigest: manifest.contentDigest,
      stateDigest: digestState(state),
      newestMtimeMs,
      bytes,
      identity: toIdentity(runStats),
    };
  } catch {
    return undefined;
  }
};

const readObservedRuns = async (roots: RetentionRoots): Promise<ObservedRun[] | undefined> => {
  const budget: InspectionBudget = { bytes: 0, entries: 0 };
  const runIds = await readDirectNames(roots.runsRoot, maxDirectRuns, budget);
  if (runIds === undefined) {
    return undefined;
  }
  const runs: ObservedRun[] = [];
  for (const runId of runIds) {
    const run = await inspectRun(roots, roots.runsRoot, runId, budget);
    if (run !== undefined) {
      runs.push(run);
    }
  }
  return runs.sort(
    (left, right) =>
      right.newestMtimeMs - left.newestMtimeMs || compareCodeUnits(right.runPath, left.runPath),
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

  const observedRuns = await readObservedRuns(roots);
  if (observedRuns === undefined) {
    return { policy: resolvedPolicy, runs: [] };
  }
  const runs = observedRuns.filter((run) => run.newestMtimeMs < now.getTime() - gracePeriodMs);
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
      if (plannedRuns.length >= maxPlanEntries) {
        return { policy: resolvedPolicy, runs: [] };
      }
      plannedRuns.push({
        runPath: run.runPath,
        manifestDigest: run.manifestDigest,
        stateDigest: run.stateDigest,
      });
      continue;
    }
    retainedBytes += run.bytes;
  }
  return { policy: resolvedPolicy, runs: plannedRuns };
};

const readPlannedRun = (
  entry: unknown,
): { runId: string; runPath: string; manifestDigest: string; stateDigest: string } | undefined => {
  if (
    !isObject(entry) ||
    typeof entry.runPath !== 'string' ||
    typeof entry.manifestDigest !== 'string' ||
    typeof entry.stateDigest !== 'string'
  ) {
    return undefined;
  }
  const parts = entry.runPath.split('/');
  if (
    parts.length !== 2 ||
    parts[0] !== 'runs' ||
    !isSafeIdentifier(parts[1]) ||
    !/^[a-f0-9]{64}$/u.test(entry.manifestDigest) ||
    !/^[a-f0-9]{64}$/u.test(entry.stateDigest)
  ) {
    return undefined;
  }
  return {
    runId: parts[1],
    runPath: entry.runPath,
    manifestDigest: entry.manifestDigest,
    stateDigest: entry.stateDigest,
  };
};

const hasPlannedState = (
  observedRun: ObservedRun | undefined,
  plannedRun: { manifestDigest: string; stateDigest: string },
  now: Date,
): observedRun is ObservedRun =>
  observedRun !== undefined &&
  observedRun.manifestDigest === plannedRun.manifestDigest &&
  observedRun.stateDigest === plannedRun.stateDigest &&
  observedRun.newestMtimeMs < now.getTime() - gracePeriodMs;

const createQuarantineTarget = async (
  roots: RetentionRoots,
  runId: string,
): Promise<QuarantineTarget | undefined> => {
  try {
    const quarantineRoot = path.join(roots.storeRoot, quarantineDirectoryName);
    await mkdir(quarantineRoot, { mode: 0o700, recursive: true });
    const rootStats = await lstat(quarantineRoot);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink() || (rootStats.mode & 0o077) !== 0) {
      return undefined;
    }
    const canonicalQuarantineRoot = await realpath(quarantineRoot);
    if (path.dirname(canonicalQuarantineRoot) !== roots.storeRoot) {
      return undefined;
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const parentPath = path.join(canonicalQuarantineRoot, `q-${randomUUID()}`);
      try {
        await mkdir(parentPath, { mode: 0o700 });
      } catch {
        continue;
      }
      const parentStats = await lstat(parentPath);
      const canonicalParentPath = await realpath(parentPath);
      if (
        !parentStats.isDirectory() ||
        parentStats.isSymbolicLink() ||
        (parentStats.mode & 0o077) !== 0 ||
        path.dirname(canonicalParentPath) !== canonicalQuarantineRoot
      ) {
        return undefined;
      }
      const targetPath = path.join(canonicalParentPath, runId);
      try {
        await mkdir(targetPath, { mode: 0o700 });
        const targetStats = await lstat(targetPath);
        const targetNames = await readDirectNames(targetPath, 0, { bytes: 0, entries: 0 });
        if (
          !targetStats.isDirectory() ||
          targetStats.isSymbolicLink() ||
          targetNames === undefined ||
          targetNames.length !== 0 ||
          path.dirname(await realpath(targetPath)) !== canonicalParentPath
        ) {
          return undefined;
        }
        return {
          parentPath: canonicalParentPath,
          parentIdentity: toIdentity(parentStats),
          targetPath,
          placeholderIdentity: toIdentity(targetStats),
        };
      } catch {
        continue;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
};

const isExactQuarantinePlaceholder = async (quarantine: QuarantineTarget): Promise<boolean> => {
  try {
    const [parentStats, targetStats] = await Promise.all([
      lstat(quarantine.parentPath),
      lstat(quarantine.targetPath),
    ]);
    const targetNames = await readDirectNames(quarantine.targetPath, 0, { bytes: 0, entries: 0 });
    return (
      parentStats.isDirectory() &&
      !parentStats.isSymbolicLink() &&
      hasIdentity(parentStats, quarantine.parentIdentity) &&
      targetStats.isDirectory() &&
      !targetStats.isSymbolicLink() &&
      hasIdentity(targetStats, quarantine.placeholderIdentity) &&
      targetNames !== undefined &&
      targetNames.length === 0 &&
      path.dirname(await realpath(quarantine.targetPath)) === quarantine.parentPath
    );
  } catch {
    return false;
  }
};

const isExactDirectRun = async (
  roots: RetentionRoots,
  observedRun: ObservedRun,
): Promise<boolean> => {
  try {
    const stats = await lstat(observedRun.canonicalPath);
    return (
      stats.isDirectory() &&
      !stats.isSymbolicLink() &&
      hasIdentity(stats, observedRun.identity) &&
      path.dirname(await realpath(observedRun.canonicalPath)) === roots.runsRoot &&
      (await rootsAreCurrent(roots))
    );
  } catch {
    return false;
  }
};

const isExactQuarantinedRun = async (
  quarantine: QuarantineTarget,
  identity: FileIdentity,
): Promise<boolean> => {
  try {
    const stats = await lstat(quarantine.targetPath);
    const parentStats = await lstat(quarantine.parentPath);
    return (
      stats.isDirectory() &&
      !stats.isSymbolicLink() &&
      hasIdentity(stats, identity) &&
      parentStats.isDirectory() &&
      !parentStats.isSymbolicLink() &&
      hasIdentity(parentStats, quarantine.parentIdentity) &&
      path.dirname(await realpath(quarantine.targetPath)) === quarantine.parentPath
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
  if (!isObject(plan) || !Array.isArray(plan.runs) || plan.runs.length > maxPlanEntries) {
    return { deleted, skipped };
  }
  const seenRunPaths = new Set<string>();
  const now = new Date();

  for (const entry of plan.runs) {
    const plannedRun = readPlannedRun(entry);
    if (
      plannedRun === undefined ||
      seenRunPaths.has(plannedRun.runPath) ||
      roots === undefined ||
      !(await rootsAreCurrent(roots))
    ) {
      if (isObject(entry) && typeof entry.runPath === 'string') {
        skipped.push(entry.runPath);
      }
      continue;
    }
    seenRunPaths.add(plannedRun.runPath);
    const initialBudget: InspectionBudget = { bytes: 0, entries: 0 };
    const initiallyObserved = await inspectRun(
      roots,
      roots.runsRoot,
      plannedRun.runId,
      initialBudget,
    );
    if (!hasPlannedState(initiallyObserved, plannedRun, now)) {
      skipped.push(plannedRun.runPath);
      continue;
    }

    try {
      await retentionTestHooks?.beforeQuarantineRename?.(plannedRun.runPath);
      if (!(await isExactDirectRun(roots, initiallyObserved))) {
        skipped.push(plannedRun.runPath);
        continue;
      }
      const quarantine = await createQuarantineTarget(roots, plannedRun.runId);
      if (
        quarantine === undefined ||
        !(await isExactDirectRun(roots, initiallyObserved)) ||
        !(await isExactQuarantinePlaceholder(quarantine))
      ) {
        skipped.push(plannedRun.runPath);
        continue;
      }
      await rename(initiallyObserved.canonicalPath, quarantine.targetPath);
      if (!(await isExactQuarantinedRun(quarantine, initiallyObserved.identity))) {
        skipped.push(plannedRun.runPath);
        continue;
      }
      const quarantinedBudget: InspectionBudget = { bytes: 0, entries: 0 };
      const quarantinedRun = await inspectRun(
        roots,
        quarantine.parentPath,
        plannedRun.runId,
        quarantinedBudget,
      );
      if (!hasPlannedState(quarantinedRun, plannedRun, now)) {
        skipped.push(plannedRun.runPath);
        continue;
      }
      if (!(await isExactQuarantinedRun(quarantine, quarantinedRun.identity))) {
        skipped.push(plannedRun.runPath);
        continue;
      }
      await rm(quarantine.targetPath, { force: false, maxRetries: 0, recursive: true });
      deleted.push(plannedRun.runPath);
    } catch {
      skipped.push(plannedRun.runPath);
    }
  }
  return { deleted, skipped };
};

const setContextRetentionTestHooks = (hooks: RetentionTestHooks | undefined): void => {
  retentionTestHooks = hooks;
};

export {
  applyContextRetention,
  planContextRetention,
  setContextRetentionTestHooks,
  type ContextRetentionPlan,
  type ContextRetentionPolicy,
  type ContextRetentionResult,
};
