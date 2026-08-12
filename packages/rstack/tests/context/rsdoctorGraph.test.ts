import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { readRsdoctorModuleGraph } from '../../src/context/rsdoctorGraph.ts';

const applicationWorkspace = path.resolve(
  import.meta.dirname,
  '../fixtures/context/reachability/application',
);

test('normalizes real and compatibility dependency rows without interpreting exports', async () => {
  const graph = await readRsdoctorModuleGraph(applicationWorkspace, 'rsdoctor-data.json');

  expect(
    graph.modules.map(({ id, path: modulePath, name, chunks, isEntry, optimizerBound }) => ({
      id,
      path: modulePath,
      name,
      chunks,
      isEntry,
      optimizerBound,
    })),
  ).toEqual([
    {
      id: '8',
      path: 'src/cjs.ts',
      name: 'src/cjs.ts',
      chunks: [],
      isEntry: false,
      optimizerBound: 'cjs',
    },
    {
      id: '6',
      path: 'src/cycle-a.ts',
      name: 'cycle-a',
      chunks: [],
      isEntry: false,
      optimizerBound: undefined,
    },
    {
      id: '7',
      path: 'src/cycle-b.ts',
      name: 'cycle-b',
      chunks: [],
      isEntry: false,
      optimizerBound: undefined,
    },
    {
      id: '1',
      path: 'src/index.ts',
      name: './src/index.ts',
      chunks: ['10', 'shared'],
      isEntry: true,
      optimizerBound: undefined,
    },
    {
      id: '5',
      path: 'src/lazy.ts',
      name: './src/lazy.ts',
      chunks: [],
      isEntry: false,
      optimizerBound: 'dynamic-import',
    },
    {
      id: '3',
      path: 'src/legacy.ts',
      name: 'legacy',
      chunks: [],
      isEntry: false,
      optimizerBound: undefined,
    },
    {
      id: '2',
      path: 'src/live.ts',
      name: 'live',
      chunks: ['10'],
      isEntry: false,
      optimizerBound: undefined,
    },
    {
      id: '4',
      path: 'src/polyfill.ts',
      name: 'polyfill',
      chunks: ['runtime'],
      isEntry: false,
      optimizerBound: 'side-effect',
    },
  ]);
  expect(graph.edges).toEqual([
    { from: '1', to: '2' },
    { from: '2', to: '6' },
    { from: '6', to: '7' },
    { from: '7', to: '6' },
  ]);
  expect(graph.exportRowsPresent).toBe(true);
  expect(graph.issues).toEqual(['duplicate-module-id', 'dangling-edge']);
});

test('maps an unclassified non-empty bailout to an unknown optimizer bound', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-rsdoctor-graph-'));
  try {
    await writeFile(
      path.join(workspaceRoot, 'rsdoctor-data.json'),
      JSON.stringify({
        data: {
          moduleGraph: {
            modules: [
              {
                id: 'module',
                name: 'module.ts',
                bailoutReason: {
                  detail: 'optimizer could not classify this module',
                },
              },
            ],
          },
        },
      }),
    );

    const graph = await readRsdoctorModuleGraph(workspaceRoot, 'rsdoctor-data.json');

    expect(graph.modules[0]?.optimizerBound).toBe('unknown-bailout');
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
});

test('reports a missing module graph as insufficient ordinary artifact data', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-rsdoctor-graph-'));
  try {
    await writeFile(path.join(workspaceRoot, 'rsdoctor-data.json'), '{"data":{}}');

    await expect(readRsdoctorModuleGraph(workspaceRoot, 'rsdoctor-data.json')).resolves.toEqual({
      modules: [],
      edges: [],
      exportRowsPresent: false,
      issues: ['module-graph-missing'],
    });
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
});
