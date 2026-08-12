const contextStoreSchemaVersion = 1 as const;
const contextStoreMaxRecordBytes: number = 1024 * 1024;

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type ContextProducer = 'rsbuild' | 'rspack' | 'rslib' | 'rstest' | 'rslint' | 'rsdoctor';
type ContextRunStatus = 'queued' | 'running' | 'pass' | 'fail' | 'cancelled' | 'error';
type ContextCompleteness = 'complete' | 'partial' | 'disabled' | 'unsupported';

type ContextDescriptor = {
  contextId: string;
  packageRoot: string;
  product: string;
  packageName?: string;
  configPath?: string;
  environment?: string;
  target?: string;
  mode?: string;
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
  source?: {
    revision?: string;
    dirtyDigest?: string;
  };
};

type ContextStoreWriteResult =
  { written: true; path: string } | { written: false; path: string; error: unknown };

type ContextStoreIssue = {
  code: 'invalid-record' | 'oversized-record' | 'unsupported-schema';
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
};

type ProjectStatus = {
  schemaVersion: typeof contextStoreSchemaVersion;
  workspaceId: string;
  contexts: ProjectContextStatus[];
  issues: ContextStoreIssue[];
};

export { contextStoreMaxRecordBytes, contextStoreSchemaVersion };
export type {
  BuildMetadataFacet,
  ContextCompleteness,
  ContextDescriptor,
  ContextProducer,
  ContextRunManifest,
  ContextRunStatus,
  ContextRunStatusEntry,
  ContextSnapshot,
  ContextStatus,
  ContextStoreIssue,
  ContextStoreWriteResult,
  ContextWorkspaceStatus,
  JsonValue,
  ProjectContextStatus,
  ProjectStatus,
};
