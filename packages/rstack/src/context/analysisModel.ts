type ModuleRef = {
  id: string;
  path: string;
  name: string;
  chunks: string[];
};

type ModuleEdge = {
  from: string;
  to: string;
};

type OptimizerBound = 'cjs' | 'dynamic-import' | 'side-effect' | 'unknown-bailout';

type ObservedModule = ModuleRef & {
  isEntry: boolean;
  optimizerBound?: OptimizerBound;
  optimizerReasons?: string[];
};

type ObservedModuleGraph = {
  modules: ObservedModule[];
  edges: ModuleEdge[];
  exportRowsPresent: boolean;
  issues: Array<'module-graph-missing' | 'duplicate-module-id' | 'dangling-edge'>;
};

type ProductRootKind =
  'production-entry' | 'published-contract' | 'side-effect' | 'conservative-runtime';

type ProductRoot = {
  kind: ProductRootKind;
  module: ModuleRef;
  label: string;
};

type ContractField = 'exports' | 'main' | 'module' | 'types' | 'bin';

type ContractTarget = {
  field: ContractField;
  target: string;
  matchedModuleIds: string[];
};

type ProductRootSet = {
  contextId: string;
  packageRoot: string;
  product: 'application' | 'library';
  roots: ProductRoot[];
  contractTargets: ContractTarget[];
  bounds: string[];
};

type AnalysisProvenance = {
  contextId: string;
  dataFile: string;
  artifactBinding: 'explicit-unverified';
  buildObservation?: {
    runId: string;
    snapshotId: string;
    observedAt: string;
    status: 'queued' | 'running' | 'pass' | 'fail' | 'cancelled' | 'error';
    buildCompleteness?: 'complete' | 'partial' | 'disabled' | 'unsupported';
  };
};

type ModuleState = {
  productionReachability: 'live' | 'unreachable' | 'unknown';
  publicContract: 'required' | 'not-required' | 'unknown';
  shipped: 'yes' | 'unknown';
  optimizerRetention: 'side-effect' | 'bailout' | 'unknown';
};

type ModuleCandidate = {
  subject: ModuleRef & { kind: 'module' };
  classification: 'unreachable-module-candidate';
  state: ModuleState;
  confidence: 'derived' | 'unknown';
  evidence: string[];
  bounds: string[];
};

type ProductRootsResult = {
  provenance: AnalysisProvenance;
  graph: {
    moduleCount: number;
    edgeCount: number;
    issues: ObservedModuleGraph['issues'];
  };
  product: ProductRootSet;
};

type UnusedCandidatesResult = {
  provenance: AnalysisProvenance;
  roots: {
    production: number;
    contract: number;
    conservative: number;
  };
  total: number;
  returned: number;
  analysisTruncated: boolean;
  resultTruncated: boolean;
  candidates: ModuleCandidate[];
  bounds: string[];
};

type ModulePath = {
  rootKind: ProductRootKind;
  modules: ModuleRef[];
};

type DeadCodeExplanation = {
  provenance: AnalysisProvenance;
  subject: ModuleRef & { kind: 'module' };
  classification:
    | 'reachable'
    | 'unreachable-module-candidate'
    | 'preserved-by-conservative-root'
    | 'insufficient-evidence';
  state: ModuleState;
  paths: ModulePath[];
  evidence: string[];
  analysisTruncated: boolean;
  bounds: string[];
};

type ModuleImpactResult = {
  provenance: AnalysisProvenance;
  subject: ModuleRef & { kind: 'module' };
  direction: 'dependencies' | 'dependents';
  modules: ModuleRef[];
  reachedRoots: ProductRoot[];
  affectedChunks: string[];
  totalVisited: number;
  returned: number;
  truncated: boolean;
  bounds: string[];
};

export type {
  AnalysisProvenance,
  ContractField,
  ContractTarget,
  DeadCodeExplanation,
  ModuleCandidate,
  ModuleEdge,
  ModuleImpactResult,
  ModulePath,
  ModuleRef,
  ModuleState,
  ObservedModule,
  ObservedModuleGraph,
  OptimizerBound,
  ProductRoot,
  ProductRootKind,
  ProductRootSet,
  ProductRootsResult,
  UnusedCandidatesResult,
};
