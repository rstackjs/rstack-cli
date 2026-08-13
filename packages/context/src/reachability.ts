import type { ObservedModule, ObservedModuleGraph } from './analysisModel.ts';

type TraversalOptions = {
  maxDepth: number;
  maxVisited: number;
};

type TraversalResult = {
  visited: string[];
  predecessor: ReadonlyMap<string, string | undefined>;
  depth: ReadonlyMap<string, number>;
  truncated: boolean;
};

const compareStrings = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

const compareModules = (left: ObservedModule, right: ObservedModule): number =>
  compareStrings(left.path, right.path) ||
  compareStrings(left.name, right.name) ||
  compareStrings(left.id, right.id);

const traceModuleGraph = (
  graph: ObservedModuleGraph,
  roots: string[],
  direction: 'dependencies' | 'dependents',
  options: TraversalOptions,
): TraversalResult => {
  const modules = new Map(graph.modules.map((module) => [module.id, module]));
  const adjacency = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    const from = direction === 'dependencies' ? edge.from : edge.to;
    const to = direction === 'dependencies' ? edge.to : edge.from;
    if (!modules.has(from) || !modules.has(to)) continue;
    const neighbors = adjacency.get(from) ?? new Set<string>();
    neighbors.add(to);
    adjacency.set(from, neighbors);
  }

  const orderedNeighbors = new Map(
    [...adjacency].map(([moduleId, neighbors]) => [
      moduleId,
      [...neighbors].sort((left, right) => compareModules(modules.get(left)!, modules.get(right)!)),
    ]),
  );
  const orderedRoots = [...new Set(roots)]
    .filter((moduleId) => modules.has(moduleId))
    .sort((left, right) => compareModules(modules.get(left)!, modules.get(right)!));
  const visited: string[] = [];
  const predecessor = new Map<string, string | undefined>();
  const depth = new Map<string, number>();
  let truncated = false;

  for (const root of orderedRoots) {
    if (visited.length >= options.maxVisited) {
      truncated = true;
      break;
    }
    visited.push(root);
    predecessor.set(root, undefined);
    depth.set(root, 0);
  }

  for (let index = 0; index < visited.length; index += 1) {
    const moduleId = visited[index];
    const moduleDepth = depth.get(moduleId)!;
    for (const neighbor of orderedNeighbors.get(moduleId) ?? []) {
      if (predecessor.has(neighbor)) continue;
      if (moduleDepth >= options.maxDepth || visited.length >= options.maxVisited) {
        truncated = true;
        continue;
      }
      visited.push(neighbor);
      predecessor.set(neighbor, moduleId);
      depth.set(neighbor, moduleDepth + 1);
    }
  }

  return { visited, predecessor, depth, truncated };
};

export { traceModuleGraph };
export type { TraversalOptions, TraversalResult };
