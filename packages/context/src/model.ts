const contextStoreSchemaVersion = 1 as const;

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type ContextProducer = 'rsbuild' | 'rspack' | 'rslib' | 'rstest' | 'rslint' | 'rsdoctor';
type ContextRunStatus = 'queued' | 'running' | 'pass' | 'fail' | 'cancelled' | 'error';
type ContextCompleteness = 'complete' | 'partial' | 'disabled' | 'unsupported';

type ContextInputFile = { path: string; digest: string };
type ContextInputCompleteness = 'complete' | 'partial';
type ContextFreshness = {
  state: 'fresh' | 'stale' | 'partial' | 'unknown';
  changedPaths: string[];
};

type ContextSnapshotSource = {
  revision?: string;
  dirtyDigest?: string;
  inputs?: ContextInputFile[];
  inputCompleteness?: ContextInputCompleteness;
  virtualInputDigest?: string;
};

type ContextDescriptor = {
  contextId: string;
  packageRoot: string;
  product: string;
  packageName?: string;
  configPath?: string;
  environment?: string;
  target?: string;
  mode?: string;
  variant?: string;
  distPath?: string;
};

type BuildMetadataFacet = {
  producer: 'rsbuild' | 'rslib';
  command: string;
  mode?: string;
  environment: string;
  target: string[];
  isWatch: boolean;
  isFirstCompile: boolean;
  durationMs: number;
  hash?: string;
  hasErrors: boolean;
  hasWarnings: boolean;
  assets: Array<{ name: string; size: number }>;
  chunks: Array<{ id?: string; files: string[]; initial?: boolean }>;
  truncated: { assets: number; chunks: number };
};

type LintMessageRecord = {
  ruleId: string | null;
  severity: 1 | 2;
  message: string;
  messageId?: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  fix?: { range: [number, number]; text: string };
  suggestions?: Array<{
    messageId?: string;
    data?: Record<string, string>;
    desc: string;
    fix: { range: [number, number]; text: string };
  }>;
};

type LintFileRecord = {
  path: string;
  digest: string;
  errorCount: number;
  warningCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
  messages: LintMessageRecord[];
  fixedOutput?: string;
};

type LintFacet = {
  producer: 'rslint';
  mode: 'files' | 'text';
  fixPreviewCaptured: boolean;
  files: LintFileRecord[];
  totals: {
    files: number;
    errors: number;
    warnings: number;
    fixableErrors: number;
    fixableWarnings: number;
  };
};

type TestErrorRecord = {
  name: string;
  message: string;
  stack?: string;
  diff?: string;
  actual?: string;
  expected?: string;
  retryCount?: number;
};

type TestCaseRecord = {
  project: string;
  path: string;
  name: string;
  parentNames?: string[];
  status: 'skip' | 'pass' | 'fail' | 'todo';
  durationMs?: number;
  errors?: TestErrorRecord[];
  retryErrors?: TestErrorRecord[];
  retryCount?: number;
};

type TestFileRecord = {
  project: string;
  path: string;
  status: 'skip' | 'pass' | 'fail' | 'todo';
  durationMs?: number;
  errors?: TestErrorRecord[];
  tests: TestCaseRecord[];
};

type TestFacet = {
  producer: 'rstest';
  files: TestFileRecord[];
  stats: {
    tests: {
      total: number;
      passed: number;
      failed: number;
      skipped: number;
      todo: number;
    };
    files: { total: number; failed: number };
  };
  durationMs: number;
  unhandledErrors: TestErrorRecord[];
};

type TestExecutionPosition = { line: number; column: number };

type TestExecutionLocation = {
  start: TestExecutionPosition;
  end: TestExecutionPosition;
};

type TestExecutionStatement = {
  id: string;
  location: TestExecutionLocation;
  hits: number;
};

type TestExecutionFunction = {
  id: string;
  name: string;
  declaration: TestExecutionLocation;
  location: TestExecutionLocation;
  hits: number;
};

type TestExecutionBranch = {
  id: string;
  type: string;
  location: TestExecutionLocation;
  arms: Array<{ location: TestExecutionLocation; hits: number }>;
};

type TestExecutionFile = {
  path: string;
  digest?: string;
  statements: TestExecutionStatement[];
  functions: TestExecutionFunction[];
  branches: TestExecutionBranch[];
};

type TestExecutionRequestedSelection = {
  include?: string[];
  exclude?: string[];
  allowExternal: boolean;
};

type TestExecutionFacet = {
  producer: 'rstest';
  provider: 'istanbul';
  availability: 'available' | 'unavailable';
  requestedSelection: TestExecutionRequestedSelection;
  digest: string;
  universe: {
    reportedFiles: number;
    storedFiles: number;
    droppedFiles: number;
    reportedLocations: number;
    storedLocations: number;
    droppedLocations: number;
    completeness: 'complete' | 'partial' | 'unknown';
  };
  truncated: { files: number; locations: number };
  bounds: {
    attribution: 'aggregate-run-only';
    testAttribution: false;
    maxFiles: 1000;
    maxLocationsPerFile: 20_000;
    maxLocationsTotal: 100_000;
  };
  files: TestExecutionFile[];
};

type ContextRunManifest = {
  schemaVersion: typeof contextStoreSchemaVersion;
  runId: string;
  producer: ContextProducer;
  command: string;
  startedAt: string;
  contexts: ContextDescriptor[];
};

type ContextSnapshot = {
  schemaVersion: typeof contextStoreSchemaVersion;
  snapshotId: string;
  runId: string;
  contextId: string;
  sequence: number;
  observedAt: string;
  status: ContextRunStatus;
  completeness: Record<string, ContextCompleteness>;
  facets: Record<string, JsonValue>;
  source?: ContextSnapshotSource;
};

type StoredContextSnapshot = {
  run: ContextRunManifest;
  context: ContextDescriptor;
  snapshot: ContextSnapshot;
};

type ContextStoreWriteResult =
  { written: true; path: string } | { written: false; path: string; error: unknown };

type ContextStoreIssue = {
  code: 'invalid-record' | 'unsupported-schema';
  path: string;
};

type ContextStatus = {
  context: ContextDescriptor;
  latestSnapshot?: ContextSnapshot;
};

type ContextRunStatusEntry = {
  run: ContextRunManifest;
  contexts: ContextStatus[];
};

type ContextWorkspaceStatus = {
  schemaVersion: typeof contextStoreSchemaVersion;
  runs: ContextRunStatusEntry[];
  issues: ContextStoreIssue[];
};

type ProjectContextStatus = {
  runId: string;
  producer: ContextProducer;
  context: ContextDescriptor;
  state: 'ready' | 'pending';
  latestSnapshot?: ContextSnapshot;
  freshness?: ContextFreshness;
};

type ProjectStatus = {
  schemaVersion: typeof contextStoreSchemaVersion;
  workspaceId: string;
  contexts: ProjectContextStatus[];
  issues: ContextStoreIssue[];
};

export { contextStoreSchemaVersion };
export type {
  BuildMetadataFacet,
  ContextCompleteness,
  ContextDescriptor,
  ContextFreshness,
  ContextInputCompleteness,
  ContextInputFile,
  ContextProducer,
  ContextRunManifest,
  ContextRunStatus,
  ContextRunStatusEntry,
  ContextSnapshot,
  ContextSnapshotSource,
  ContextStatus,
  ContextStoreIssue,
  ContextStoreWriteResult,
  ContextWorkspaceStatus,
  JsonValue,
  LintFacet,
  LintFileRecord,
  LintMessageRecord,
  ProjectContextStatus,
  ProjectStatus,
  StoredContextSnapshot,
  TestCaseRecord,
  TestErrorRecord,
  TestExecutionBranch,
  TestExecutionFacet,
  TestExecutionFile,
  TestExecutionFunction,
  TestExecutionLocation,
  TestExecutionPosition,
  TestExecutionRequestedSelection,
  TestExecutionStatement,
  TestFacet,
  TestFileRecord,
};
