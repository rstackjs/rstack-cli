import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DeadCodeExplanation } from './analysisModel.ts';
import { diagnosticsFromStoredSnapshot, type DiagnosticRecord } from './lint.ts';
import type {
  ContextFreshness,
  ContextSnapshot,
  StoredContextSnapshot,
  TestExecutionFacet,
  TestExecutionLocation,
  TestFacet,
} from './model.ts';
import { explainDeadCodeCandidate, readProductRoots } from './queries.ts';
import { assessSnapshotFreshness } from './source.ts';
import { readContextSnapshotById, readContextSnapshots } from './store.ts';

type CodeEvidenceQuery = {
  path: string;
  line?: number;
  contextId?: string;
  dataFile?: string;
  testSnapshotId?: string;
  lintSnapshotId?: string;
  maxDepth?: number;
};

type SnapshotEvidence = {
  snapshotId: string;
  contextId: string;
  observedAt: string;
  status: ContextSnapshot['status'];
  completeness: ContextSnapshot['completeness'];
  freshness: ContextFreshness;
  packageRoot: string;
};

type ExecutionCoverageEvidence = {
  state: 'observed' | 'not-observed' | 'unknown' | 'unavailable';
  reason?:
    | 'no-test-snapshot'
    | 'not-captured'
    | 'provider-unavailable'
    | 'path-not-reported'
    | 'digest-unavailable'
    | 'digest-mismatch'
    | 'partial-universe'
    | 'no-overlapping-locations';
  relevantLocations: number;
  observedLocations: number;
  fileDigest?: string;
};

type TestOutcomeEvidence = {
  state: 'failed' | 'passed' | 'not-run' | 'unknown';
  reason?: 'no-exact-test-record';
  matchingFiles: number;
  matchingTests: number;
};

type CodeDiagnosticEvidence = {
  total: number;
  returned: number;
  truncated: boolean;
  items: DiagnosticRecord[];
};

type CodeEvidenceResult = {
  path: string;
  line?: number;
  executionCoverage: ExecutionCoverageEvidence;
  testOutcome: TestOutcomeEvidence;
  diagnostics: CodeDiagnosticEvidence;
  module?: DeadCodeExplanation;
  provenance: { test?: SnapshotEvidence; lint?: SnapshotEvidence };
  bounds: string[];
};

const normalizeSourcePath = (workspaceRoot: string, value: string): string => {
  const portable = value.replaceAll('\\', '/');
  if (portable.length === 0 || path.posix.isAbsolute(portable)) {
    throw new Error('path must be a non-empty checkout-relative source path.');
  }
  const normalized = path.posix.normalize(portable).replace(/^\.\//u, '');
  const relative = path
    .relative(workspaceRoot, path.resolve(workspaceRoot, normalized))
    .split(path.sep)
    .join('/');
  if (relative.length === 0 || relative === '..' || relative.startsWith('../')) {
    throw new Error('path must be a non-empty checkout-relative source path.');
  }
  return relative;
};

const packageContainsPath = (packageRoot: string, sourcePath: string): boolean => {
  const normalizedRoot = path.posix.normalize(packageRoot.replaceAll('\\', '/'));
  return (
    normalizedRoot === '.' ||
    sourcePath === normalizedRoot ||
    sourcePath.startsWith(`${normalizedRoot}/`)
  );
};

const selectSnapshot = async (
  workspaceRoot: string,
  producer: 'rstest' | 'rslint',
  sourcePath: string,
  snapshotId: string | undefined,
): Promise<StoredContextSnapshot | undefined> => {
  if (snapshotId !== undefined) {
    const selected = await readContextSnapshotById(workspaceRoot, snapshotId);
    if (selected === undefined || selected.run.producer !== producer) {
      throw new Error(`${producer === 'rstest' ? 'Rstest' : 'Rslint'} snapshot not found.`);
    }
    if (!packageContainsPath(selected.context.packageRoot, sourcePath)) {
      throw new Error(
        `Selected ${producer === 'rstest' ? 'Rstest' : 'Rslint'} snapshot package root does not contain the source path.`,
      );
    }
    return selected;
  }
  return (await readContextSnapshots(workspaceRoot, { producer })).find(
    ({ context, snapshot }) =>
      packageContainsPath(context.packageRoot, sourcePath) &&
      snapshot.facets[producer === 'rstest' ? 'test' : 'lint'] !== undefined,
  );
};

const snapshotEvidence = async (
  workspaceRoot: string,
  stored: StoredContextSnapshot,
): Promise<SnapshotEvidence> => ({
  snapshotId: stored.snapshot.snapshotId,
  contextId: stored.snapshot.contextId,
  observedAt: stored.snapshot.observedAt,
  status: stored.snapshot.status,
  completeness: stored.snapshot.completeness,
  freshness: await assessSnapshotFreshness(workspaceRoot, stored.snapshot),
  packageRoot: stored.context.packageRoot,
});

const locationOverlapsLine = (location: TestExecutionLocation, line: number | undefined): boolean =>
  line === undefined || (location.start.line <= line && location.end.line >= line);

const readCurrentDigest = async (
  workspaceRoot: string,
  sourcePath: string,
): Promise<string | undefined> => {
  try {
    return createHash('sha256')
      .update(await readFile(path.resolve(workspaceRoot, sourcePath)))
      .digest('hex');
  } catch {
    return undefined;
  }
};

const executionCoverage = async (
  workspaceRoot: string,
  sourcePath: string,
  line: number | undefined,
  stored: StoredContextSnapshot | undefined,
): Promise<ExecutionCoverageEvidence> => {
  const empty = { relevantLocations: 0, observedLocations: 0 };
  if (stored === undefined) return { state: 'unavailable', reason: 'no-test-snapshot', ...empty };
  const facet = stored.snapshot.facets.execution as unknown as TestExecutionFacet | undefined;
  if (facet === undefined) return { state: 'unavailable', reason: 'not-captured', ...empty };
  if (facet.availability !== 'available') {
    return { state: 'unavailable', reason: 'provider-unavailable', ...empty };
  }
  const file = facet.files.find((entry) => entry.path === sourcePath);
  if (file === undefined) return { state: 'unknown', reason: 'path-not-reported', ...empty };
  const digest = await readCurrentDigest(workspaceRoot, sourcePath);
  if (digest === undefined || file.digest === undefined) {
    return { state: 'unknown', reason: 'digest-unavailable', fileDigest: file.digest, ...empty };
  }
  if (digest !== file.digest) {
    return { state: 'unknown', reason: 'digest-mismatch', fileDigest: file.digest, ...empty };
  }

  const hits = [
    ...file.statements
      .filter(({ location }) => locationOverlapsLine(location, line))
      .map(({ hits }) => hits),
    ...file.functions
      .filter(({ location }) => locationOverlapsLine(location, line))
      .map(({ hits }) => hits),
    ...file.branches.flatMap(({ arms }) =>
      arms.filter(({ location }) => locationOverlapsLine(location, line)).map(({ hits }) => hits),
    ),
  ];
  const observedLocations = hits.filter((value) => value > 0).length;
  const counts = { relevantLocations: hits.length, observedLocations, fileDigest: file.digest };
  if (hits.length === 0) {
    return { state: 'unknown', reason: 'no-overlapping-locations', ...counts };
  }
  if (observedLocations > 0) return { state: 'observed', ...counts };
  if (
    stored.snapshot.completeness.execution !== 'complete' ||
    facet.universe.completeness !== 'complete' ||
    facet.truncated.files > 0 ||
    facet.truncated.locations > 0
  ) {
    return { state: 'unknown', reason: 'partial-universe', ...counts };
  }
  return { state: 'not-observed', ...counts };
};

const testOutcome = (
  sourcePath: string,
  stored: StoredContextSnapshot | undefined,
): TestOutcomeEvidence => {
  if (stored === undefined) return { state: 'unknown', matchingFiles: 0, matchingTests: 0 };
  const facet = stored.snapshot.facets.test as unknown as TestFacet | undefined;
  if (facet === undefined) return { state: 'unknown', matchingFiles: 0, matchingTests: 0 };
  const files = facet.files.filter((file) => file.path === sourcePath);
  const tests = facet.files
    .flatMap((file) => file.tests)
    .filter((test) => test.path === sourcePath);
  if (files.length === 0 && tests.length === 0) {
    return {
      state: 'unknown',
      reason: 'no-exact-test-record',
      matchingFiles: 0,
      matchingTests: 0,
    };
  }
  if (
    files.some((file) => file.status === 'fail') ||
    tests.some((test) => test.status === 'fail')
  ) {
    return { state: 'failed', matchingFiles: files.length, matchingTests: tests.length };
  }
  if (
    files.some((file) => file.status === 'pass') ||
    tests.some((test) => test.status === 'pass')
  ) {
    return { state: 'passed', matchingFiles: files.length, matchingTests: tests.length };
  }
  return { state: 'not-run', matchingFiles: files.length, matchingTests: tests.length };
};

const compareDiagnostics = (left: DiagnosticRecord, right: DiagnosticRecord): number =>
  left.producer.localeCompare(right.producer) ||
  (left.line ?? 0) - (right.line ?? 0) ||
  (left.column ?? 0) - (right.column ?? 0) ||
  left.message.localeCompare(right.message);

const moduleEvidence = async (
  workspaceRoot: string,
  query: Required<Pick<CodeEvidenceQuery, 'contextId' | 'dataFile'>> &
    Pick<CodeEvidenceQuery, 'maxDepth'> & { path: string },
): Promise<DeadCodeExplanation> => {
  const roots = await readProductRoots(workspaceRoot, query);
  const packageRelativePath =
    roots.product.packageRoot === '.'
      ? query.path
      : query.path.startsWith(`${roots.product.packageRoot}/`)
        ? query.path.slice(roots.product.packageRoot.length + 1)
        : query.path;
  const insufficientEvidence = (): DeadCodeExplanation => ({
    provenance: roots.provenance,
    classification: 'insufficient-evidence',
    state: {
      productionReachability: 'unknown',
      publicContract: 'unknown',
      shipped: 'unknown',
      optimizerRetention: 'unknown',
    },
    paths: [],
    evidence: ['No unique artifact module matched the exact source path.'],
    analysisTruncated: false,
    bounds: [...roots.product.bounds, 'source-path-module-match-unavailable'],
  });
  try {
    return await explainDeadCodeCandidate(workspaceRoot, {
      contextId: query.contextId,
      dataFile: query.dataFile,
      module: query.path,
      maxDepth: query.maxDepth,
    });
  } catch (error) {
    if (error instanceof Error && /^Ambiguous module selector:/u.test(error.message)) {
      return insufficientEvidence();
    }
    if (!(error instanceof Error) || !/^Unknown module selector:/u.test(error.message)) throw error;
    if (packageRelativePath !== query.path) {
      try {
        return await explainDeadCodeCandidate(workspaceRoot, {
          contextId: query.contextId,
          dataFile: query.dataFile,
          module: packageRelativePath,
          maxDepth: query.maxDepth,
        });
      } catch (fallbackError) {
        if (
          !(fallbackError instanceof Error) ||
          !/^(?:Unknown|Ambiguous) module selector:/u.test(fallbackError.message)
        ) {
          throw fallbackError;
        }
      }
    }
    return insufficientEvidence();
  }
};

const readCodeEvidence = async (
  workspaceRoot: string,
  query: CodeEvidenceQuery,
): Promise<CodeEvidenceResult> => {
  if ((query.contextId === undefined) !== (query.dataFile === undefined)) {
    throw new Error('contextId and dataFile must be supplied together.');
  }
  if (query.line !== undefined && (!Number.isInteger(query.line) || query.line < 1)) {
    throw new Error('line must be a positive integer.');
  }
  const sourcePath = normalizeSourcePath(workspaceRoot, query.path);
  const [testSnapshot, lintSnapshot] = await Promise.all([
    selectSnapshot(workspaceRoot, 'rstest', sourcePath, query.testSnapshotId),
    selectSnapshot(workspaceRoot, 'rslint', sourcePath, query.lintSnapshotId),
  ]);
  const matchingDiagnostics = [
    ...(lintSnapshot === undefined ? [] : diagnosticsFromStoredSnapshot(lintSnapshot)),
    ...(testSnapshot === undefined ? [] : diagnosticsFromStoredSnapshot(testSnapshot)),
  ]
    .filter((diagnostic) => diagnostic.path === sourcePath)
    .sort(compareDiagnostics);
  const diagnosticItems = matchingDiagnostics.slice(0, 200);
  const diagnostics: CodeDiagnosticEvidence = {
    total: matchingDiagnostics.length,
    returned: diagnosticItems.length,
    truncated: diagnosticItems.length < matchingDiagnostics.length,
    items: diagnosticItems,
  };
  const module =
    query.contextId === undefined || query.dataFile === undefined
      ? undefined
      : await moduleEvidence(workspaceRoot, {
          path: sourcePath,
          contextId: query.contextId,
          dataFile: query.dataFile,
          maxDepth: query.maxDepth,
        });
  const provenance = {
    ...(testSnapshot === undefined
      ? {}
      : { test: await snapshotEvidence(workspaceRoot, testSnapshot) }),
    ...(lintSnapshot === undefined
      ? {}
      : { lint: await snapshotEvidence(workspaceRoot, lintSnapshot) }),
  };
  const bounds = [
    'aggregate-execution-no-test-attribution',
    'test-outcome-exact-path-only',
    'diagnostics-exact-path-only',
    ...(module !== undefined && module.provenance.artifactBinding !== 'exact'
      ? ['artifact-binding-not-exact']
      : []),
  ];
  return {
    path: sourcePath,
    ...(query.line === undefined ? {} : { line: query.line }),
    executionCoverage: await executionCoverage(workspaceRoot, sourcePath, query.line, testSnapshot),
    testOutcome: testOutcome(sourcePath, testSnapshot),
    diagnostics,
    ...(module === undefined ? {} : { module }),
    provenance,
    bounds,
  };
};

export { readCodeEvidence };
export type {
  CodeDiagnosticEvidence,
  CodeEvidenceQuery,
  CodeEvidenceResult,
  ExecutionCoverageEvidence,
  SnapshotEvidence,
  TestOutcomeEvidence,
};
