import { expect, test } from '@rstest/core';
import type { ObservedModuleGraph } from '../src/analysisModel.ts';
import { traceModuleGraph } from '../src/reachability.ts';

const graph: ObservedModuleGraph = {
  modules: [
    {
      id: 'root',
      path: 'src/root.ts',
      name: 'root',
      chunks: [],
      isEntry: true,
    },
    { id: 'b', path: 'src/b.ts', name: 'b', chunks: [], isEntry: false },
    { id: 'a', path: 'src/a.ts', name: 'a', chunks: [], isEntry: false },
    { id: 'end', path: 'src/end.ts', name: 'end', chunks: [], isEntry: false },
  ],
  edges: [
    { from: 'root', to: 'b' },
    { from: 'root', to: 'a' },
    { from: 'b', to: 'end' },
    { from: 'a', to: 'end' },
    { from: 'end', to: 'root' },
  ],
  exportRowsPresent: false,
  issues: [],
};

test('traces dependencies breadth-first with deterministic shortest paths through cycles', () => {
  const result = traceModuleGraph(graph, ['root'], 'dependencies', {
    maxDepth: 8,
    maxVisited: 20,
  });

  expect(result.visited).toEqual(['root', 'a', 'b', 'end']);
  expect([...result.predecessor]).toEqual([
    ['root', undefined],
    ['a', 'root'],
    ['b', 'root'],
    ['end', 'a'],
  ]);
  expect([...result.depth]).toEqual([
    ['root', 0],
    ['a', 1],
    ['b', 1],
    ['end', 2],
  ]);
  expect(result.truncated).toBe(false);
});

test('traces dependents by reversing observed issuer edges', () => {
  const result = traceModuleGraph(graph, ['end'], 'dependents', {
    maxDepth: 8,
    maxVisited: 20,
  });

  expect(result.visited).toEqual(['end', 'a', 'b', 'root']);
  expect(result.predecessor.get('root')).toBe('a');
  expect(result.depth.get('root')).toBe(2);
  expect(result.truncated).toBe(false);
});

test('marks depth-bounded traversals as truncated when reachable neighbors remain', () => {
  const result = traceModuleGraph(graph, ['root'], 'dependencies', {
    maxDepth: 1,
    maxVisited: 20,
  });

  expect(result.visited).toEqual(['root', 'a', 'b']);
  expect(result.visited).not.toContain('end');
  expect(result.truncated).toBe(true);
});

test('marks node-bounded traversals as truncated without exceeding the visit limit', () => {
  const result = traceModuleGraph(graph, ['root'], 'dependencies', {
    maxDepth: 8,
    maxVisited: 2,
  });

  expect(result.visited).toEqual(['root', 'a']);
  expect(result.truncated).toBe(true);
});
