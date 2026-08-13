import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { TestRunResult } from '@rstest/core/api';
import type {
  TestExecutionBranch,
  TestExecutionFacet,
  TestExecutionFile,
  TestExecutionFunction,
  TestExecutionLocation,
  TestExecutionRequestedSelection,
  TestExecutionStatement,
} from './model.ts';

type TestExecutionRequest = {
  include?: string[];
  exclude?: string[];
  allowExternal?: boolean;
};

const executionBounds = {
  attribution: 'aggregate-run-only',
  testAttribution: false,
  maxFiles: 1000,
  maxLocationsPerFile: 20_000,
  maxLocationsTotal: 100_000,
} as const;

type ExecutionEntry =
  | { kind: 'statement'; locations: 1; value: TestExecutionStatement }
  | { kind: 'function'; locations: 2; value: TestExecutionFunction }
  | { kind: 'branch'; locations: number; value: TestExecutionBranch };

type ExecutionFileCandidate = {
  path: string;
  absolutePath: string;
  structured: boolean;
  readable: boolean;
  reportedLocations: number;
  entries: ExecutionEntry[];
};

const sha256Pattern = /^[0-9a-f]{64}$/u;

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

const isPositiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
};

const toWorkspacePath = (workspaceRoot: string, filePath: string): string =>
  path.relative(workspaceRoot, path.resolve(workspaceRoot, filePath)).split(path.sep).join('/');

const normalizeLocation = (value: unknown): TestExecutionLocation | undefined => {
  if (!isRecordObject(value) || !isRecordObject(value.start) || !isRecordObject(value.end)) {
    return undefined;
  }
  const positions = [value.start, value.end];
  if (
    !positions.every(
      (position) => isPositiveInteger(position.line) && isNonNegativeInteger(position.column),
    )
  ) {
    return undefined;
  }
  return {
    start: { line: value.start.line as number, column: value.start.column as number },
    end: { line: value.end.line as number, column: value.end.column as number },
  };
};

const sortedRecordEntries = (value: Record<string, unknown>): Array<[string, unknown]> =>
  Object.entries(value).sort(([left], [right]) => left.localeCompare(right));

const unwrapCoverageFile = (value: unknown): Record<string, unknown> | undefined => {
  if (!isRecordObject(value)) return undefined;
  return isRecordObject(value.data) ? value.data : value;
};

const normalizeExecutionFile = (
  workspaceRoot: string,
  packageRoot: string,
  mapPath: string,
  rawValue: unknown,
): ExecutionFileCandidate => {
  const data = unwrapCoverageFile(rawValue);
  const sourcePath =
    data !== undefined && typeof data.path === 'string' && data.path.length > 0
      ? data.path
      : mapPath;
  const absolutePath = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.resolve(packageRoot, sourcePath);
  const normalizedPath = toWorkspacePath(workspaceRoot, absolutePath);
  if (
    data === undefined ||
    !isRecordObject(data.statementMap) ||
    !isRecordObject(data.fnMap) ||
    !isRecordObject(data.branchMap) ||
    !isRecordObject(data.s) ||
    !isRecordObject(data.f) ||
    !isRecordObject(data.b)
  ) {
    return {
      path: normalizedPath,
      absolutePath,
      structured: false,
      readable: false,
      reportedLocations: 0,
      entries: [],
    };
  }

  const entries: ExecutionEntry[] = [];
  let reportedLocations = 0;
  let readable = true;
  for (const [id, rawLocation] of sortedRecordEntries(data.statementMap)) {
    reportedLocations += 1;
    const location = normalizeLocation(rawLocation);
    const hits = data.s[id];
    if (location === undefined || !isNonNegativeInteger(hits) || id.length === 0) {
      readable = false;
      continue;
    }
    entries.push({ kind: 'statement', locations: 1, value: { id, location, hits } });
  }
  for (const [id, rawFunction] of sortedRecordEntries(data.fnMap)) {
    reportedLocations += 2;
    const hits = data.f[id];
    if (!isRecordObject(rawFunction)) {
      readable = false;
      continue;
    }
    const declaration = normalizeLocation(rawFunction.decl);
    const location = normalizeLocation(rawFunction.loc);
    if (
      declaration === undefined ||
      location === undefined ||
      typeof rawFunction.name !== 'string' ||
      !isNonNegativeInteger(hits) ||
      id.length === 0
    ) {
      readable = false;
      continue;
    }
    entries.push({
      kind: 'function',
      locations: 2,
      value: { id, name: rawFunction.name, declaration, location, hits },
    });
  }
  for (const [id, rawBranch] of sortedRecordEntries(data.branchMap)) {
    const rawArms =
      isRecordObject(rawBranch) && Array.isArray(rawBranch.locations) ? rawBranch.locations : [];
    const locations = 1 + rawArms.length;
    reportedLocations += locations;
    const rawHits = data.b[id];
    if (
      !isRecordObject(rawBranch) ||
      typeof rawBranch.type !== 'string' ||
      !Array.isArray(rawBranch.locations) ||
      !Array.isArray(rawHits) ||
      rawHits.length !== rawBranch.locations.length ||
      id.length === 0
    ) {
      readable = false;
      continue;
    }
    const location = normalizeLocation(rawBranch.loc);
    const arms = rawBranch.locations.map((rawLocation, index) => {
      const armLocation = normalizeLocation(rawLocation);
      const hits = rawHits[index];
      return armLocation === undefined || !isNonNegativeInteger(hits)
        ? undefined
        : { location: armLocation, hits };
    });
    if (location === undefined || arms.some((arm) => arm === undefined)) {
      readable = false;
      continue;
    }
    entries.push({
      kind: 'branch',
      locations,
      value: {
        id,
        type: rawBranch.type,
        location,
        arms: arms as TestExecutionBranch['arms'],
      },
    });
  }

  return {
    path: normalizedPath,
    absolutePath,
    structured: true,
    readable,
    reportedLocations,
    entries,
  };
};

const requestedExecutionSelection = (
  request: TestExecutionRequest,
): TestExecutionRequestedSelection => ({
  ...(request.include === undefined ? {} : { include: [...request.include] }),
  ...(request.exclude === undefined ? {} : { exclude: [...request.exclude] }),
  allowExternal: request.allowExternal ?? false,
});

const withExecutionDigest = (facet: Omit<TestExecutionFacet, 'digest'>): TestExecutionFacet => ({
  ...facet,
  digest: createHash('sha256').update(JSON.stringify(facet)).digest('hex'),
});

const unavailableExecutionFacet = (request: TestExecutionRequest): TestExecutionFacet =>
  withExecutionDigest({
    producer: 'rstest',
    provider: 'istanbul',
    availability: 'unavailable',
    requestedSelection: requestedExecutionSelection(request),
    universe: {
      reportedFiles: 0,
      storedFiles: 0,
      droppedFiles: 0,
      reportedLocations: 0,
      storedLocations: 0,
      droppedLocations: 0,
      completeness: 'unknown',
    },
    truncated: { files: 0, locations: 0 },
    bounds: executionBounds,
    files: [],
  });

const normalizeExecutionFacet = async (
  workspaceRoot: string,
  packageRoot: string,
  request: TestExecutionRequest,
  coverage: TestRunResult['coverage'],
): Promise<TestExecutionFacet> => {
  if (!isRecordObject(coverage)) return unavailableExecutionFacet(request);

  const candidates = sortedRecordEntries(coverage)
    .map(([mapPath, value]) => normalizeExecutionFile(workspaceRoot, packageRoot, mapPath, value))
    .sort(
      (left, right) =>
        left.path.localeCompare(right.path) || Number(right.structured) - Number(left.structured),
    );
  const files: TestExecutionFile[] = [];
  const seenPaths = new Set<string>();
  let readable = true;
  let storedLocations = 0;
  let truncatedFiles = 0;
  let truncatedLocations = 0;

  for (const candidate of candidates) {
    if (!candidate.structured || seenPaths.has(candidate.path)) {
      readable = false;
      continue;
    }
    seenPaths.add(candidate.path);
    readable &&= candidate.readable;
    if (files.length >= executionBounds.maxFiles) {
      truncatedFiles += 1;
      truncatedLocations += candidate.entries.reduce((total, entry) => total + entry.locations, 0);
      continue;
    }

    const file: TestExecutionFile = {
      path: candidate.path,
      statements: [],
      functions: [],
      branches: [],
    };
    try {
      file.digest = createHash('sha256')
        .update(await readFile(candidate.absolutePath))
        .digest('hex');
    } catch {
      readable = false;
    }
    let fileLocations = 0;
    for (const entry of candidate.entries) {
      if (
        fileLocations + entry.locations > executionBounds.maxLocationsPerFile ||
        storedLocations + entry.locations > executionBounds.maxLocationsTotal
      ) {
        truncatedLocations += entry.locations;
        continue;
      }
      fileLocations += entry.locations;
      storedLocations += entry.locations;
      if (entry.kind === 'statement') file.statements.push(entry.value);
      if (entry.kind === 'function') file.functions.push(entry.value);
      if (entry.kind === 'branch') file.branches.push(entry.value);
    }
    files.push(file);
  }

  const reportedFiles = candidates.length;
  const reportedLocations = candidates.reduce(
    (total, candidate) => total + candidate.reportedLocations,
    0,
  );
  const droppedFiles = reportedFiles - files.length;
  const droppedLocations = reportedLocations - storedLocations;
  const complete =
    readable &&
    droppedFiles === 0 &&
    droppedLocations === 0 &&
    truncatedFiles === 0 &&
    truncatedLocations === 0;
  return withExecutionDigest({
    producer: 'rstest',
    provider: 'istanbul',
    availability: 'available',
    requestedSelection: requestedExecutionSelection(request),
    universe: {
      reportedFiles,
      storedFiles: files.length,
      droppedFiles,
      reportedLocations,
      storedLocations,
      droppedLocations,
      completeness: complete ? 'complete' : 'partial',
    },
    truncated: { files: truncatedFiles, locations: truncatedLocations },
    bounds: executionBounds,
    files,
  });
};

const validateExecutionRequest = (request: TestExecutionRequest | undefined): void => {
  if (request === undefined) return;
  for (const key of ['include', 'exclude'] as const) {
    const patterns = request[key];
    if (
      patterns !== undefined &&
      (!Array.isArray(patterns) || patterns.some((pattern) => typeof pattern !== 'string'))
    ) {
      throw new Error(`Execution ${key} must be an array of string patterns.`);
    }
    if (patterns !== undefined && patterns.length > 200)
      throw new Error(`Execution ${key} must contain at most 200 patterns.`);
  }
  if (request.allowExternal !== undefined && typeof request.allowExternal !== 'boolean')
    throw new Error('Execution allowExternal must be a boolean.');
};

const isExecutionPosition = (value: unknown): boolean =>
  isRecordObject(value) &&
  hasOnlyKeys(value, ['line', 'column']) &&
  isPositiveInteger(value.line) &&
  isNonNegativeInteger(value.column);

const isExecutionLocation = (value: unknown): boolean =>
  isRecordObject(value) &&
  hasOnlyKeys(value, ['start', 'end']) &&
  isExecutionPosition(value.start) &&
  isExecutionPosition(value.end);

const isExecutionStatement = (value: unknown): boolean =>
  isRecordObject(value) &&
  hasOnlyKeys(value, ['id', 'location', 'hits']) &&
  isIdentifier(value.id) &&
  isExecutionLocation(value.location) &&
  isNonNegativeInteger(value.hits);

const isExecutionFunction = (value: unknown): boolean =>
  isRecordObject(value) &&
  hasOnlyKeys(value, ['id', 'name', 'declaration', 'location', 'hits']) &&
  isIdentifier(value.id) &&
  typeof value.name === 'string' &&
  isExecutionLocation(value.declaration) &&
  isExecutionLocation(value.location) &&
  isNonNegativeInteger(value.hits);

const isExecutionBranch = (value: unknown): boolean =>
  isRecordObject(value) &&
  hasOnlyKeys(value, ['id', 'type', 'location', 'arms']) &&
  isIdentifier(value.id) &&
  typeof value.type === 'string' &&
  isExecutionLocation(value.location) &&
  Array.isArray(value.arms) &&
  value.arms.every(
    (arm) =>
      isRecordObject(arm) &&
      hasOnlyKeys(arm, ['location', 'hits']) &&
      isExecutionLocation(arm.location) &&
      isNonNegativeInteger(arm.hits),
  );

const isExecutionFile = (value: unknown): boolean =>
  isRecordObject(value) &&
  hasOnlyKeys(value, ['path', 'digest', 'statements', 'functions', 'branches']) &&
  isIdentifier(value.path) &&
  (value.digest === undefined ||
    (typeof value.digest === 'string' && sha256Pattern.test(value.digest))) &&
  Array.isArray(value.statements) &&
  value.statements.every(isExecutionStatement) &&
  Array.isArray(value.functions) &&
  value.functions.every(isExecutionFunction) &&
  Array.isArray(value.branches) &&
  value.branches.every(isExecutionBranch);

const countExecutionLocations = (file: Record<string, unknown>): number => {
  const statements = file.statements as unknown[];
  const functions = file.functions as unknown[];
  const branches = file.branches as Array<{ arms: unknown[] }>;
  return (
    statements.length +
    functions.length * 2 +
    branches.reduce((total, branch) => total + 1 + branch.arms.length, 0)
  );
};

const isRequestedExecutionSelection = (value: unknown): boolean =>
  isRecordObject(value) &&
  hasOnlyKeys(value, ['include', 'exclude', 'allowExternal']) &&
  typeof value.allowExternal === 'boolean' &&
  (value.include === undefined ||
    (Array.isArray(value.include) &&
      value.include.length <= 200 &&
      value.include.every((entry) => typeof entry === 'string'))) &&
  (value.exclude === undefined ||
    (Array.isArray(value.exclude) &&
      value.exclude.length <= 200 &&
      value.exclude.every((entry) => typeof entry === 'string')));

const validateExecutionFacet = (value: unknown): TestExecutionFacet | undefined => {
  if (
    !isRecordObject(value) ||
    !hasOnlyKeys(value, [
      'producer',
      'provider',
      'availability',
      'requestedSelection',
      'digest',
      'universe',
      'truncated',
      'bounds',
      'files',
    ]) ||
    value.producer !== 'rstest' ||
    value.provider !== 'istanbul' ||
    (value.availability !== 'available' && value.availability !== 'unavailable') ||
    !isRequestedExecutionSelection(value.requestedSelection) ||
    typeof value.digest !== 'string' ||
    !sha256Pattern.test(value.digest) ||
    !isRecordObject(value.universe) ||
    !hasOnlyKeys(value.universe, [
      'reportedFiles',
      'storedFiles',
      'droppedFiles',
      'reportedLocations',
      'storedLocations',
      'droppedLocations',
      'completeness',
    ]) ||
    !isNonNegativeInteger(value.universe.reportedFiles) ||
    !isNonNegativeInteger(value.universe.storedFiles) ||
    !isNonNegativeInteger(value.universe.droppedFiles) ||
    !isNonNegativeInteger(value.universe.reportedLocations) ||
    !isNonNegativeInteger(value.universe.storedLocations) ||
    !isNonNegativeInteger(value.universe.droppedLocations) ||
    !['complete', 'partial', 'unknown'].includes(value.universe.completeness as string) ||
    value.universe.reportedFiles !==
      (value.universe.storedFiles as number) + (value.universe.droppedFiles as number) ||
    value.universe.reportedLocations !==
      (value.universe.storedLocations as number) + (value.universe.droppedLocations as number) ||
    !isRecordObject(value.truncated) ||
    !hasOnlyKeys(value.truncated, ['files', 'locations']) ||
    !isNonNegativeInteger(value.truncated.files) ||
    !isNonNegativeInteger(value.truncated.locations) ||
    value.truncated.files > (value.universe.droppedFiles as number) ||
    value.truncated.locations > (value.universe.droppedLocations as number) ||
    !isRecordObject(value.bounds) ||
    !hasOnlyKeys(value.bounds, [
      'attribution',
      'testAttribution',
      'maxFiles',
      'maxLocationsPerFile',
      'maxLocationsTotal',
    ]) ||
    value.bounds.attribution !== 'aggregate-run-only' ||
    value.bounds.testAttribution !== false ||
    value.bounds.maxFiles !== executionBounds.maxFiles ||
    value.bounds.maxLocationsPerFile !== executionBounds.maxLocationsPerFile ||
    value.bounds.maxLocationsTotal !== executionBounds.maxLocationsTotal ||
    !Array.isArray(value.files) ||
    !value.files.every(isExecutionFile) ||
    value.files.length > executionBounds.maxFiles ||
    value.files.length !== value.universe.storedFiles ||
    new Set(value.files.map((file) => (file as { path: string }).path)).size !==
      value.files.length ||
    value.files.some(
      (file) =>
        countExecutionLocations(file as Record<string, unknown>) >
        executionBounds.maxLocationsPerFile,
    ) ||
    value.universe.storedLocations > executionBounds.maxLocationsTotal ||
    value.files.reduce(
      (total, file) => total + countExecutionLocations(file as Record<string, unknown>),
      0,
    ) !== value.universe.storedLocations
  ) {
    return undefined;
  }

  const unavailable = value.availability === 'unavailable';
  const noReportedEvidence =
    value.universe.reportedFiles === 0 && value.universe.reportedLocations === 0;
  const complete =
    value.universe.droppedFiles === 0 &&
    value.universe.droppedLocations === 0 &&
    value.truncated.files === 0 &&
    value.truncated.locations === 0;
  if (
    (unavailable &&
      (!noReportedEvidence ||
        value.files.length !== 0 ||
        value.universe.completeness !== 'unknown')) ||
    (!unavailable && value.universe.completeness === 'unknown') ||
    (value.universe.completeness === 'complete' &&
      (!complete || value.files.some((file) => !('digest' in (file as Record<string, unknown>)))))
  ) {
    return undefined;
  }

  return value as TestExecutionFacet;
};

export {
  normalizeExecutionFacet,
  unavailableExecutionFacet,
  validateExecutionFacet,
  validateExecutionRequest,
};
export type { TestExecutionRequest };
