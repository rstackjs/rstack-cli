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
import type { ContextDescriptor, ContextSnapshot } from './model.ts';
import { resolveProductRoots } from './products.ts';
import { traceModuleGraph, type TraversalResult } from './reachability.ts';
import {
  readRsdoctorArtifact,
  type RsdoctorArtifactCompilationIdentity,
  type RsdoctorArtifactMetadata,
} from './rsdoctor.ts';
import { normalizeRsdoctorModuleGraph } from './rsdoctorGraph.ts';
import { readProjectStatus } from './status.ts';

type ArtifactQuery = {
  contextId: string;
  dataFile: string;
};

type UnusedCandidatesQuery = ArtifactQuery & { limit?: number; cursor?: string };
type PaginatedUnusedCandidatesResult = UnusedCandidatesResult & { nextCursor?: string };
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

const isDependencyModulePath = (modulePath: string): boolean => {
  const normalized = modulePath.split('\\').join('/');
  const segments = normalized.split('/');
  const yarnIndex = segments.indexOf('.yarn');
  return (
    segments.includes('node_modules') ||
    (yarnIndex >= 0 &&
      ['cache', '__virtual__', 'unplugged'].includes(segments[yarnIndex + 1] ?? ''))
  );
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const getTargets = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value])
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .sort(compareStrings);

const artifactTargetsIncludeSnapshot = (
  artifactTarget: unknown,
  snapshotTarget: unknown,
): boolean => {
  const artifactTargets = new Set(getTargets(artifactTarget));
  return getTargets(snapshotTarget).every((target) => artifactTargets.has(target));
};

const bindArtifactToSnapshot = (
  context: ContextDescriptor,
  snapshot: ContextSnapshot | undefined,
  metadata: RsdoctorArtifactMetadata | undefined,
): AnalysisProvenance['artifactBinding'] => {
  if (snapshot === undefined || metadata === undefined) return 'explicit-unverified';
  const build = snapshot.facets.build;
  if (!isObject(build)) return 'explicit-unverified';

  const snapshotHash = getString(build.hash);
  const snapshotEnvironment = getString(build.environment) ?? context.environment;
  if (snapshotHash === undefined || snapshotEnvironment === undefined) {
    return 'explicit-unverified';
  }
  if (context.environment !== undefined && context.environment !== snapshotEnvironment) {
    return 'mismatch';
  }

  let identity: RsdoctorArtifactCompilationIdentity;
  let artifactEnvironment: string | undefined;
  if (metadata.build.compilers !== undefined) {
    const matchingCompilers = metadata.build.compilers.filter(
      (compiler) =>
        compiler.environment === snapshotEnvironment || compiler.name === snapshotEnvironment,
    );
    if (matchingCompilers.length !== 1) return 'mismatch';
    identity = matchingCompilers[0]!;
    artifactEnvironment = identity.environment ?? matchingCompilers[0].name;
  } else {
    identity = metadata.build;
    artifactEnvironment =
      identity.environment ??
      (metadata.build.compiler.name === snapshotEnvironment
        ? metadata.build.compiler.name
        : undefined);
  }

  if (identity.compilationHash !== undefined && identity.compilationHash !== snapshotHash) {
    return 'mismatch';
  }
  if (identity.environment !== undefined && identity.environment !== snapshotEnvironment) {
    return 'mismatch';
  }
  const snapshotTarget = getTargets(build.target).length > 0 ? build.target : context.target;
  if (
    identity.target !== undefined &&
    getTargets(snapshotTarget).length > 0 &&
    !artifactTargetsIncludeSnapshot(identity.target, snapshotTarget)
  ) {
    return 'mismatch';
  }
  if (identity.compilationHash === undefined || artifactEnvironment === undefined) {
    return 'explicit-unverified';
  }
  return artifactEnvironment === snapshotEnvironment ? 'exact' : 'mismatch';
};

const toModuleRef = ({
  isEntry: _,
  optimizerBound: __,
  optimizerReasons: ___,
  ...module
}: ObservedModule): ModuleRef => module;

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

const decodeUnusedCandidatesCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) return 0;
  const value = Buffer.from(cursor, 'base64url').toString('utf8');
  const offset = Number(value);
  if (
    !/^(?:0|[1-9]\d*)$/u.test(value) ||
    Buffer.from(value).toString('base64url') !== cursor ||
    !Number.isSafeInteger(offset)
  ) {
    throw new Error('Invalid unused candidates cursor.');
  }
  return offset;
};

const validateMaxDepth = (maxDepth: number | undefined, maximum = 16, fallback = 8): number => {
  const resolved = maxDepth ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > maximum) {
    throw new Error(`maxDepth must be an integer from 1 to ${maximum}.`);
  }
  return resolved;
};

const selectContext = async (
  workspaceRoot: string,
  query: ArtifactQuery,
): Promise<{
  context: ContextDescriptor;
  snapshot: ContextSnapshot | undefined;
  provenance: AnalysisProvenance;
}> => {
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
    snapshot,
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
  const { context, snapshot, provenance } = await selectContext(workspaceRoot, query);
  const artifact = await readRsdoctorArtifact(workspaceRoot, query.dataFile);
  const artifactBinding = bindArtifactToSnapshot(context, snapshot, artifact.metadata);
  const observedGraph = normalizeRsdoctorModuleGraph(artifact);
  const graph =
    artifactBinding === 'mismatch'
      ? {
          ...observedGraph,
          issues: [...new Set([...observedGraph.issues, 'artifact-build-mismatch' as const])],
        }
      : observedGraph;
  const graphForProducts =
    artifactBinding === 'mismatch'
      ? {
          modules: [],
          edges: [],
          exportRowsPresent: false,
          issues: graph.issues,
        }
      : graph;
  const product = await resolveProductRoots(workspaceRoot, context, graphForProducts);
  return { provenance: { ...provenance, artifactBinding }, graph, product };
};

const hasAuthoritativeGraph = (graph: ObservedModuleGraph): boolean =>
  !graph.issues.some((issue) =>
    ['artifact-build-mismatch', 'module-graph-missing', 'module-graph-omitted'].includes(issue),
  );

const unavailableGraphEvidence = (graph: ObservedModuleGraph): string =>
  graph.issues.includes('artifact-build-mismatch')
    ? 'The artifact graph does not match the selected build snapshot.'
    : 'The artifact does not contain an available module graph.';

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
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new Error(`Ambiguous module selector: ${selector}`);

  const suffix = graph.modules.filter(({ path: modulePath }) => {
    const normalizedPath = normalizeSelector(modulePath);
    return normalizedPath === normalized || normalizedPath.endsWith(`/${normalized}`);
  });
  if (suffix.length === 1) return suffix[0];
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
  const root = roots.find(({ module }) => module.id === modules[0].id);
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
): Promise<PaginatedUnusedCandidatesResult> => {
  const limit = validateLimit(query.limit);
  const offset = decodeUnusedCandidatesCursor(query.cursor);
  const { provenance, graph, product } = await loadAnalysis(workspaceRoot, query);
  if (!hasAuthoritativeGraph(graph)) {
    return {
      provenance,
      roots: { production: 0, contract: 0, conservative: 0 },
      total: 0,
      returned: 0,
      ownership: { project: 0, dependency: 0 },
      analysisTruncated: false,
      resultTruncated: false,
      candidates: [],
      bounds: product.bounds,
    };
  }
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
    }))
    .sort(
      (left, right) =>
        Number(isDependencyModulePath(left.subject.path)) -
          Number(isDependencyModulePath(right.subject.path)) ||
        compareStrings(left.subject.path, right.subject.path) ||
        compareStrings(left.subject.id, right.subject.id),
    );
  const dependencyCandidates = candidates.filter(({ subject }) =>
    isDependencyModulePath(subject.path),
  ).length;
  const returnedCandidates = candidates.slice(offset, offset + limit);
  const nextOffset = offset + returnedCandidates.length;

  return {
    provenance,
    roots: {
      production: rootsOfKind(product, 'production').length,
      contract: rootsOfKind(product, 'contract').length,
      conservative: rootsOfKind(product, 'conservative').length,
    },
    total: candidates.length,
    returned: returnedCandidates.length,
    ownership: {
      project: candidates.length - dependencyCandidates,
      dependency: dependencyCandidates,
    },
    analysisTruncated:
      traversals.production.truncated ||
      traversals.contract.truncated ||
      traversals.conservative.truncated,
    resultTruncated: nextOffset < candidates.length,
    candidates: returnedCandidates,
    ...(nextOffset < candidates.length
      ? { nextCursor: Buffer.from(String(nextOffset)).toString('base64url') }
      : {}),
    bounds,
  };
};

const explainDeadCodeCandidate = async (
  workspaceRoot: string,
  query: ExplanationQuery,
): Promise<DeadCodeExplanation> => {
  const maxDepth = validateMaxDepth(
    query.maxDepth,
    candidateTraversalOptions.maxDepth,
    candidateTraversalOptions.maxDepth,
  );
  const { provenance, graph, product } = await loadAnalysis(workspaceRoot, query);
  if (!hasAuthoritativeGraph(graph)) {
    return {
      provenance,
      classification: 'insufficient-evidence',
      state: {
        productionReachability: 'unknown',
        publicContract: 'unknown',
        shipped: 'unknown',
        optimizerRetention: 'unknown',
      },
      paths: [],
      evidence: [unavailableGraphEvidence(graph)],
      analysisTruncated: false,
      bounds: product.bounds,
    };
  }
  const module = resolveModule(graph, query.module);
  const traversals = traceRootFamilies(
    graph,
    product,
    maxDepth,
    candidateTraversalOptions.maxVisited,
  );
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
  evidence.push(
    ...(module.optimizerReasons ?? []).map((reason) => `Rsdoctor optimizer: ${reason}`),
  );

  return {
    provenance,
    subject: toSubject(module),
    classification,
    state: moduleState(module, product, traversals),
    paths,
    evidence,
    analysisTruncated:
      traversals.production.truncated ||
      traversals.contract.truncated ||
      traversals.conservative.truncated,
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
  if (!hasAuthoritativeGraph(graph)) {
    return {
      provenance,
      direction,
      modules: [],
      reachedRoots: [],
      affectedChunks: [],
      totalVisited: 0,
      returned: 0,
      truncated: false,
      bounds: product.bounds,
    };
  }
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
