import path from 'node:path';
import type {
  AnalysisProvenance,
  DeadCodeExplanation,
  ModuleCandidate,
  ModuleImpactResult,
  ModulePath,
  ModuleRef,
  ModuleState,
  ObservedModule,
  ObservedModuleGraph,
  ProductRoot,
  ProductRootSet,
  ProductRootsResult,
  UnusedCandidatesResult,
} from './analysisModel.ts';
import type { ContextDescriptor } from './model.ts';
import { resolveProductRoots } from './products.ts';
import { traceModuleGraph, type TraversalResult } from './reachability.ts';
import { readRsdoctorModuleGraph } from './rsdoctorGraph.ts';
import { readProjectStatus } from './status.ts';

type ArtifactQuery = {
  contextId: string;
  dataFile: string;
};

type UnusedCandidatesQuery = ArtifactQuery & { limit?: number };
type ExplanationQuery = ArtifactQuery & { module: string; maxDepth?: number };
type ImpactQuery = ExplanationQuery & {
  direction?: 'dependencies' | 'dependents';
};

type LoadedAnalysis = {
  provenance: AnalysisProvenance;
  graph: ObservedModuleGraph;
  product: ProductRootSet;
};

type RootTraversals = {
  production: TraversalResult;
  contract: TraversalResult;
  conservative: TraversalResult;
};

const candidateTraversalOptions = { maxDepth: 32, maxVisited: 20_000 } as const;
const explanationVisitLimit = 5_000;

const compareStrings = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

const toModuleRef = ({ isEntry: _, optimizerBound: __, ...module }: ObservedModule): ModuleRef =>
  module;

const toSubject = (module: ObservedModule): ModuleCandidate['subject'] => ({
  kind: 'module',
  ...toModuleRef(module),
});

const normalizeSelector = (value: string): string =>
  path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//u, '');

const validateLimit = (limit: number | undefined): number => {
  const resolved = limit ?? 50;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 100) {
    throw new Error('limit must be an integer from 1 to 100.');
  }
  return resolved;
};

const validateMaxDepth = (maxDepth: number | undefined): number => {
  const resolved = maxDepth ?? 8;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 16) {
    throw new Error('maxDepth must be an integer from 1 to 16.');
  }
  return resolved;
};

const selectContext = async (
  workspaceRoot: string,
  query: ArtifactQuery,
): Promise<{ context: ContextDescriptor; provenance: AnalysisProvenance }> => {
  const status = await readProjectStatus(workspaceRoot);
  const matches = status.contexts.filter(({ context }) => context.contextId === query.contextId);
  if (matches.length === 0) throw new Error(`Unknown context: ${query.contextId}`);

  const ready = matches
    .filter((entry) => entry.latestSnapshot !== undefined)
    .sort(
      (left, right) =>
        compareStrings(left.latestSnapshot!.observedAt, right.latestSnapshot!.observedAt) ||
        compareStrings(left.runId, right.runId),
    );
  const selected =
    ready.at(-1) ?? [...matches].sort((a, b) => compareStrings(a.runId, b.runId)).at(-1)!;
  const snapshot = ready.at(-1)?.latestSnapshot;
  const buildCompleteness = snapshot?.completeness.build;

  return {
    context: selected.context,
    provenance: {
      contextId: query.contextId,
      dataFile: query.dataFile,
      artifactBinding: 'explicit-unverified',
      ...(snapshot === undefined
        ? {}
        : {
            buildObservation: {
              runId: snapshot.runId,
              snapshotId: snapshot.snapshotId,
              observedAt: snapshot.observedAt,
              status: snapshot.status,
              ...(buildCompleteness === undefined ? {} : { buildCompleteness }),
            },
          }),
    },
  };
};

const loadAnalysis = async (
  workspaceRoot: string,
  query: ArtifactQuery,
): Promise<LoadedAnalysis> => {
  const { context, provenance } = await selectContext(workspaceRoot, query);
  const graph = await readRsdoctorModuleGraph(workspaceRoot, query.dataFile);
  const product = await resolveProductRoots(workspaceRoot, context, graph);
  return { provenance, graph, product };
};

const rootsOfKind = (
  product: ProductRootSet,
  family: 'production' | 'contract' | 'conservative',
): ProductRoot[] =>
  product.roots.filter(({ kind }) =>
    family === 'production'
      ? kind === 'production-entry'
      : family === 'contract'
        ? kind === 'published-contract'
        : kind === 'side-effect' || kind === 'conservative-runtime',
  );

const traceRootFamilies = (
  graph: ObservedModuleGraph,
  product: ProductRootSet,
  maxDepth: number,
  maxVisited: number,
): RootTraversals => ({
  production: traceModuleGraph(
    graph,
    rootsOfKind(product, 'production').map(({ module }) => module.id),
    'dependencies',
    { maxDepth, maxVisited },
  ),
  contract: traceModuleGraph(
    graph,
    rootsOfKind(product, 'contract').map(({ module }) => module.id),
    'dependencies',
    { maxDepth, maxVisited },
  ),
  conservative: traceModuleGraph(
    graph,
    rootsOfKind(product, 'conservative').map(({ module }) => module.id),
    'dependencies',
    { maxDepth, maxVisited },
  ),
});

const traversalBounds = (product: ProductRootSet, traversals: RootTraversals): string[] => {
  const bounds = [...product.bounds];
  if (traversals.production.truncated) bounds.push('production-traversal-truncated');
  if (traversals.contract.truncated) bounds.push('contract-traversal-truncated');
  if (traversals.conservative.truncated) bounds.push('conservative-traversal-truncated');
  return bounds;
};

const moduleState = (
  module: ObservedModule,
  product: ProductRootSet,
  traversals: RootTraversals,
): ModuleState => {
  const productionLive = traversals.production.predecessor.has(module.id);
  const contractRequired = traversals.contract.predecessor.has(module.id);
  return {
    productionReachability: productionLive
      ? 'live'
      : traversals.production.truncated || product.bounds.includes('no-production-entry-roots')
        ? 'unknown'
        : 'unreachable',
    publicContract:
      product.product === 'application'
        ? 'not-required'
        : contractRequired
          ? 'required'
          : 'unknown',
    shipped: module.chunks.length > 0 ? 'yes' : 'unknown',
    optimizerRetention:
      module.optimizerBound === 'side-effect'
        ? 'side-effect'
        : module.optimizerBound === undefined
          ? 'unknown'
          : 'bailout',
  };
};

const isCandidate = (
  moduleId: string,
  product: ProductRootSet,
  traversals: RootTraversals,
): boolean =>
  !product.bounds.includes('no-production-entry-roots') &&
  !traversals.production.truncated &&
  !traversals.contract.truncated &&
  !traversals.conservative.truncated &&
  !traversals.production.predecessor.has(moduleId) &&
  !traversals.contract.predecessor.has(moduleId) &&
  !traversals.conservative.predecessor.has(moduleId);

const resolveModule = (graph: ObservedModuleGraph, selector: string): ObservedModule => {
  const byId = graph.modules.find(({ id }) => id === selector);
  if (byId !== undefined) return byId;

  const normalized = normalizeSelector(selector);
  const exact = graph.modules.filter(
    (module) =>
      normalizeSelector(module.path) === normalized ||
      normalizeSelector(module.name) === normalized,
  );
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) throw new Error(`Ambiguous module selector: ${selector}`);

  const suffix = graph.modules.filter(({ path: modulePath }) => {
    const normalizedPath = normalizeSelector(modulePath);
    return normalizedPath === normalized || normalizedPath.endsWith(`/${normalized}`);
  });
  if (suffix.length === 1) return suffix[0]!;
  if (suffix.length > 1) throw new Error(`Ambiguous module selector: ${selector}`);
  throw new Error(`Unknown module selector: ${selector}`);
};

const reconstructPath = (
  graph: ObservedModuleGraph,
  traversal: TraversalResult,
  moduleId: string,
): ModuleRef[] => {
  const moduleById = new Map(graph.modules.map((module) => [module.id, module]));
  const ids: string[] = [];
  let current: string | undefined = moduleId;
  while (current !== undefined) {
    ids.push(current);
    current = traversal.predecessor.get(current);
  }
  return ids.reverse().map((id) => toModuleRef(moduleById.get(id)!));
};

const shortestRootPath = (
  graph: ObservedModuleGraph,
  roots: ProductRoot[],
  traversal: TraversalResult,
  moduleId: string,
): ModulePath | undefined => {
  if (!traversal.predecessor.has(moduleId)) return undefined;
  const modules = reconstructPath(graph, traversal, moduleId);
  const root = roots.find(({ module }) => module.id === modules[0]!.id);
  return root === undefined ? undefined : { rootKind: root.kind, modules };
};

const readProductRoots = async (
  workspaceRoot: string,
  query: ArtifactQuery,
): Promise<ProductRootsResult> => {
  const { provenance, graph, product } = await loadAnalysis(workspaceRoot, query);
  return {
    provenance,
    graph: {
      moduleCount: graph.modules.length,
      edgeCount: graph.edges.length,
      issues: graph.issues,
    },
    product,
  };
};

const findUnusedCandidates = async (
  workspaceRoot: string,
  query: UnusedCandidatesQuery,
): Promise<UnusedCandidatesResult> => {
  const limit = validateLimit(query.limit);
  const { provenance, graph, product } = await loadAnalysis(workspaceRoot, query);
  const traversals = traceRootFamilies(
    graph,
    product,
    candidateTraversalOptions.maxDepth,
    candidateTraversalOptions.maxVisited,
  );
  const bounds = traversalBounds(product, traversals);
  const candidates = graph.modules
    .filter(({ id }) => isCandidate(id, product, traversals))
    .map((module): ModuleCandidate => ({
      subject: toSubject(module),
      classification: 'unreachable-module-candidate',
      state: moduleState(module, product, traversals),
      confidence: 'derived',
      evidence: ['No path from selected roots in this artifact graph.'],
      bounds,
    }));
  const returnedCandidates = candidates.slice(0, limit);

  return {
    provenance,
    roots: {
      production: rootsOfKind(product, 'production').length,
      contract: rootsOfKind(product, 'contract').length,
      conservative: rootsOfKind(product, 'conservative').length,
    },
    total: candidates.length,
    returned: returnedCandidates.length,
    analysisTruncated:
      traversals.production.truncated ||
      traversals.contract.truncated ||
      traversals.conservative.truncated,
    resultTruncated: candidates.length > returnedCandidates.length,
    candidates: returnedCandidates,
    bounds,
  };
};

const explainDeadCodeCandidate = async (
  workspaceRoot: string,
  query: ExplanationQuery,
): Promise<DeadCodeExplanation> => {
  const maxDepth = validateMaxDepth(query.maxDepth);
  const { provenance, graph, product } = await loadAnalysis(workspaceRoot, query);
  const module = resolveModule(graph, query.module);
  const traversals = traceRootFamilies(graph, product, maxDepth, explanationVisitLimit);
  const bounds = traversalBounds(product, traversals);
  const productionPath = shortestRootPath(
    graph,
    rootsOfKind(product, 'production'),
    traversals.production,
    module.id,
  );
  const contractPath = shortestRootPath(
    graph,
    rootsOfKind(product, 'contract'),
    traversals.contract,
    module.id,
  );
  const conservativePath = shortestRootPath(
    graph,
    rootsOfKind(product, 'conservative'),
    traversals.conservative,
    module.id,
  );

  let classification: DeadCodeExplanation['classification'];
  let paths: ModulePath[];
  let evidence: string[];
  if (productionPath !== undefined || contractPath !== undefined) {
    classification = 'reachable';
    paths = [productionPath, contractPath].filter((entry) => entry !== undefined);
    evidence = ['A shortest path from a selected product root exists in this artifact graph.'];
  } else if (conservativePath !== undefined) {
    classification = 'preserved-by-conservative-root';
    paths = [conservativePath];
    evidence = [
      'The module is reachable from a conservative optimizer root in this artifact graph.',
    ];
  } else if (isCandidate(module.id, product, traversals)) {
    classification = 'unreachable-module-candidate';
    paths = [];
    evidence = ['No path from selected roots in this artifact graph.'];
  } else {
    classification = 'insufficient-evidence';
    paths = [];
    evidence = [
      product.bounds.includes('no-production-entry-roots')
        ? 'No production entry roots were observed in this artifact graph.'
        : 'Traversal bounds prevented a complete reachability result for this module.',
    ];
  }

  return {
    provenance,
    subject: toSubject(module),
    classification,
    state: moduleState(module, product, traversals),
    paths,
    evidence,
    bounds,
  };
};

const traceModuleImpact = async (
  workspaceRoot: string,
  query: ImpactQuery,
): Promise<ModuleImpactResult> => {
  const maxDepth = validateMaxDepth(query.maxDepth);
  const direction = query.direction ?? 'dependents';
  const { provenance, graph, product } = await loadAnalysis(workspaceRoot, query);
  const module = resolveModule(graph, query.module);
  const traversal = traceModuleGraph(graph, [module.id], direction, {
    maxDepth,
    maxVisited: explanationVisitLimit,
  });
  const moduleById = new Map(graph.modules.map((entry) => [entry.id, entry]));
  const modules = traversal.visited.map((id) => toModuleRef(moduleById.get(id)!));
  const visited = new Set(traversal.visited);
  const reachedRoots = product.roots.filter(({ module: root }) => visited.has(root.id));
  const affectedChunks = [...new Set(modules.flatMap(({ chunks }) => chunks))].sort(compareStrings);

  return {
    provenance,
    subject: toSubject(module),
    direction,
    modules,
    reachedRoots,
    affectedChunks,
    totalVisited: traversal.visited.length,
    returned: modules.length,
    truncated: traversal.truncated,
    bounds: [...product.bounds, ...(traversal.truncated ? ['impact-traversal-truncated'] : [])],
  };
};

export { explainDeadCodeCandidate, findUnusedCandidates, readProductRoots, traceModuleImpact };
export type { ArtifactQuery, ExplanationQuery, ImpactQuery, UnusedCandidatesQuery };
