import {
  contextStoreSchemaVersion,
  type ContextCompleteness,
  type ContextDescriptor,
  type ContextProducer,
  type ContextRunManifest,
  type ContextRunStatus,
  type ContextSnapshot,
} from './model.ts';

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

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isRecordPath = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isContextDescriptor = (value: unknown): value is ContextDescriptor =>
  isRecordObject(value) &&
  isIdentifier(value.contextId) &&
  isRecordPath(value.packageRoot) &&
  typeof value.product === 'string' &&
  value.product.length > 0 &&
  (value.packageName === undefined || typeof value.packageName === 'string') &&
  (value.configPath === undefined || isRecordPath(value.configPath)) &&
  (value.environment === undefined || typeof value.environment === 'string') &&
  (value.target === undefined || typeof value.target === 'string') &&
  (value.mode === undefined || typeof value.mode === 'string');

const validateRunManifest = (value: unknown): ContextRunManifest | undefined => {
  if (
    !isRecordObject(value) ||
    value.schemaVersion !== contextStoreSchemaVersion ||
    !isIdentifier(value.runId) ||
    !producers.has(value.producer as ContextProducer) ||
    typeof value.command !== 'string' ||
    typeof value.startedAt !== 'string' ||
    !Array.isArray(value.contexts) ||
    value.contexts.length === 0 ||
    !value.contexts.every(isContextDescriptor)
  ) {
    return undefined;
  }

  const contextIds = new Set(value.contexts.map((context) => context.contextId));
  return contextIds.size === value.contexts.length ? (value as ContextRunManifest) : undefined;
};

const isCompleteness = (value: unknown): value is Record<string, ContextCompleteness> =>
  isRecordObject(value) &&
  Object.values(value).every((entry) => completenessValues.has(entry as ContextCompleteness));

const validateSnapshot = (value: unknown): ContextSnapshot | undefined =>
  isRecordObject(value) &&
  value.schemaVersion === contextStoreSchemaVersion &&
  isIdentifier(value.snapshotId) &&
  isIdentifier(value.runId) &&
  isIdentifier(value.contextId) &&
  Number.isSafeInteger(value.sequence) &&
  (value.sequence as number) >= 0 &&
  typeof value.observedAt === 'string' &&
  statuses.has(value.status as ContextRunStatus) &&
  isCompleteness(value.completeness) &&
  isRecordObject(value.facets)
    ? (value as ContextSnapshot)
    : undefined;

const getContextSnapshotGenerationFileName = (
  snapshot: Pick<ContextSnapshot, 'sequence' | 'snapshotId'>,
): string => `${snapshot.sequence.toString().padStart(10, '0')}-${snapshot.snapshotId}.json`;

const parseContextSnapshotGenerationFileName = (
  fileName: string,
): Pick<ContextSnapshot, 'sequence' | 'snapshotId'> | undefined => {
  const separatorIndex = fileName.indexOf('-');
  if (separatorIndex < 1 || !fileName.endsWith('.json')) {
    return undefined;
  }

  const sequenceText = fileName.slice(0, separatorIndex);
  const sequence = Number(sequenceText);
  const snapshotId = fileName.slice(separatorIndex + 1, -'.json'.length);
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 0 ||
    sequenceText !== sequence.toString().padStart(10, '0') ||
    snapshotId.length === 0
  ) {
    return undefined;
  }
  return { sequence, snapshotId };
};

const compareDescending = (left: string, right: string): number =>
  left === right ? 0 : left > right ? -1 : 1;

const compareContextSnapshotGenerationFileNames = (left: string, right: string): number => {
  const leftGeneration = parseContextSnapshotGenerationFileName(left);
  const rightGeneration = parseContextSnapshotGenerationFileName(right);
  if (leftGeneration === undefined || rightGeneration === undefined) {
    if (leftGeneration !== undefined) {
      return -1;
    }
    if (rightGeneration !== undefined) {
      return 1;
    }
    return compareDescending(left, right);
  }
  if (leftGeneration.sequence !== rightGeneration.sequence) {
    return leftGeneration.sequence > rightGeneration.sequence ? -1 : 1;
  }
  return (
    compareDescending(leftGeneration.snapshotId, rightGeneration.snapshotId) ||
    compareDescending(left, right)
  );
};

const isContextSnapshotGenerationFileName = (
  fileName: string,
  snapshot: Pick<ContextSnapshot, 'sequence' | 'snapshotId'>,
): boolean => fileName === getContextSnapshotGenerationFileName(snapshot);

export {
  compareContextSnapshotGenerationFileNames,
  getContextSnapshotGenerationFileName,
  isContextSnapshotGenerationFileName,
  isRecordObject,
  validateRunManifest,
  validateSnapshot,
};
