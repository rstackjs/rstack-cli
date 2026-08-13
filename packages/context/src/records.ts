import {
  contextStoreSchemaVersion,
  type ContextCompleteness,
  type ContextDescriptor,
  type ContextProducer,
  type ContextRunManifest,
  type ContextRunStatus,
  type ContextSnapshot,
  type LintFacet,
  type TestFacet,
} from './model.ts';
import { validateExecutionFacet } from './execution.ts';

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
const testStatuses = new Set(['skip', 'pass', 'fail', 'todo']);
const sha256Pattern = /^[0-9a-f]{64}$/u;

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isRecordPath = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

const isPositiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;

const isOptionalString = (value: unknown): boolean =>
  value === undefined || typeof value === 'string';

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecordObject(value) && Object.values(value).every((entry) => typeof entry === 'string');

const isFix = (value: unknown): boolean =>
  isRecordObject(value) &&
  Array.isArray(value.range) &&
  value.range.length === 2 &&
  value.range.every(isNonNegativeInteger) &&
  typeof value.text === 'string';

const isLintMessage = (value: unknown): boolean =>
  isRecordObject(value) &&
  (value.ruleId === null || typeof value.ruleId === 'string') &&
  (value.severity === 1 || value.severity === 2) &&
  typeof value.message === 'string' &&
  isOptionalString(value.messageId) &&
  isPositiveInteger(value.line) &&
  isPositiveInteger(value.column) &&
  (value.endLine === undefined || isPositiveInteger(value.endLine)) &&
  (value.endColumn === undefined || isPositiveInteger(value.endColumn)) &&
  (value.fix === undefined || isFix(value.fix)) &&
  (value.suggestions === undefined ||
    (Array.isArray(value.suggestions) &&
      value.suggestions.every(
        (suggestion) =>
          isRecordObject(suggestion) &&
          isOptionalString(suggestion.messageId) &&
          (suggestion.data === undefined || isStringRecord(suggestion.data)) &&
          typeof suggestion.desc === 'string' &&
          isFix(suggestion.fix),
      )));

const isLintFile = (value: unknown): boolean =>
  isRecordObject(value) &&
  isRecordPath(value.path) &&
  typeof value.digest === 'string' &&
  sha256Pattern.test(value.digest) &&
  isNonNegativeInteger(value.errorCount) &&
  isNonNegativeInteger(value.warningCount) &&
  isNonNegativeInteger(value.fixableErrorCount) &&
  isNonNegativeInteger(value.fixableWarningCount) &&
  Array.isArray(value.messages) &&
  value.messages.every(isLintMessage) &&
  isOptionalString(value.fixedOutput);

const validateLintFacet = (value: unknown): LintFacet | undefined => {
  if (
    !isRecordObject(value) ||
    value.producer !== 'rslint' ||
    (value.mode !== 'files' && value.mode !== 'text') ||
    typeof value.fixPreviewCaptured !== 'boolean' ||
    !Array.isArray(value.files) ||
    !value.files.every(isLintFile) ||
    !isRecordObject(value.totals) ||
    !isNonNegativeInteger(value.totals.files) ||
    !isNonNegativeInteger(value.totals.errors) ||
    !isNonNegativeInteger(value.totals.warnings) ||
    !isNonNegativeInteger(value.totals.fixableErrors) ||
    !isNonNegativeInteger(value.totals.fixableWarnings)
  ) {
    return undefined;
  }
  return value as LintFacet;
};

const isTestError = (value: unknown): boolean =>
  isRecordObject(value) &&
  typeof value.name === 'string' &&
  typeof value.message === 'string' &&
  isOptionalString(value.stack) &&
  isOptionalString(value.diff) &&
  isOptionalString(value.actual) &&
  isOptionalString(value.expected) &&
  (value.retryCount === undefined || isNonNegativeInteger(value.retryCount));

const isTestCase = (value: unknown): boolean =>
  isRecordObject(value) &&
  typeof value.project === 'string' &&
  isRecordPath(value.path) &&
  typeof value.name === 'string' &&
  (value.parentNames === undefined ||
    (Array.isArray(value.parentNames) &&
      value.parentNames.every((entry) => typeof entry === 'string'))) &&
  testStatuses.has(value.status as string) &&
  (value.durationMs === undefined || isNonNegativeNumber(value.durationMs)) &&
  (value.errors === undefined ||
    (Array.isArray(value.errors) && value.errors.every(isTestError))) &&
  (value.retryErrors === undefined ||
    (Array.isArray(value.retryErrors) && value.retryErrors.every(isTestError))) &&
  (value.retryCount === undefined || isNonNegativeInteger(value.retryCount));

const isTestFile = (value: unknown): boolean =>
  isRecordObject(value) &&
  typeof value.project === 'string' &&
  isRecordPath(value.path) &&
  testStatuses.has(value.status as string) &&
  (value.durationMs === undefined || isNonNegativeNumber(value.durationMs)) &&
  (value.errors === undefined ||
    (Array.isArray(value.errors) && value.errors.every(isTestError))) &&
  Array.isArray(value.tests) &&
  value.tests.every(isTestCase);

const validateTestFacet = (value: unknown): TestFacet | undefined => {
  if (
    !isRecordObject(value) ||
    value.producer !== 'rstest' ||
    !Array.isArray(value.files) ||
    !value.files.every(isTestFile) ||
    !isRecordObject(value.stats) ||
    !isRecordObject(value.stats.tests) ||
    !isNonNegativeInteger(value.stats.tests.total) ||
    !isNonNegativeInteger(value.stats.tests.passed) ||
    !isNonNegativeInteger(value.stats.tests.failed) ||
    !isNonNegativeInteger(value.stats.tests.skipped) ||
    !isNonNegativeInteger(value.stats.tests.todo) ||
    !isRecordObject(value.stats.files) ||
    !isNonNegativeInteger(value.stats.files.total) ||
    !isNonNegativeInteger(value.stats.files.failed) ||
    !isNonNegativeNumber(value.durationMs) ||
    !Array.isArray(value.unhandledErrors) ||
    !value.unhandledErrors.every(isTestError)
  ) {
    return undefined;
  }
  return value as TestFacet;
};

const isJsonValue = (value: unknown): boolean => {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecordObject(value) && Object.values(value).every(isJsonValue);
};

const isSnapshotSource = (value: unknown): boolean => {
  if (!isRecordObject(value)) return false;
  const hasInputs = value.inputs !== undefined;
  const hasCompleteness = value.inputCompleteness !== undefined;
  return (
    isOptionalString(value.revision) &&
    isOptionalString(value.dirtyDigest) &&
    hasInputs === hasCompleteness &&
    (!hasInputs ||
      (Array.isArray(value.inputs) &&
        value.inputs.every(
          (input) =>
            isRecordObject(input) &&
            isRecordPath(input.path) &&
            typeof input.digest === 'string' &&
            sha256Pattern.test(input.digest),
        ) &&
        (value.inputCompleteness === 'complete' || value.inputCompleteness === 'partial'))) &&
    (value.virtualInputDigest === undefined ||
      (typeof value.virtualInputDigest === 'string' &&
        sha256Pattern.test(value.virtualInputDigest))) &&
    (value.captureSelection === undefined || isJsonValue(value.captureSelection))
  );
};

const areFacetsValid = (value: Record<string, unknown>): boolean =>
  Object.entries(value).every(([name, facet]) => {
    const producer = isRecordObject(facet) ? facet.producer : undefined;
    if (name === 'execution') {
      return validateExecutionFacet(facet) !== undefined;
    }
    if (name === 'lint' || name === 'rslint' || producer === 'rslint') {
      return validateLintFacet(facet) !== undefined;
    }
    if (name === 'test' || name === 'rstest' || producer === 'rstest') {
      return validateTestFacet(facet) !== undefined;
    }
    return isJsonValue(facet);
  });

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
  isRecordObject(value.facets) &&
  areFacetsValid(value.facets) &&
  (value.source === undefined || isSnapshotSource(value.source))
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
  validateExecutionFacet,
  validateLintFacet,
  validateTestFacet,
};
