import path from 'node:path';
import { expect, test } from 'rstack/test';
import type { ContextDescriptor } from '../../src/context/model.ts';
import { resolveProductRoots } from '../../src/context/products.ts';
import { readRsdoctorModuleGraph } from '../../src/context/rsdoctorGraph.ts';

const fixtureRoot = path.resolve(import.meta.dirname, '../fixtures/context/reachability');

const context = (contextId: string, product: 'application' | 'library'): ContextDescriptor => ({
  contextId,
  packageRoot: '.',
  product,
});

test('derives application entry and conservative optimizer roots', async () => {
  const workspaceRoot = path.join(fixtureRoot, 'application');
  const graph = await readRsdoctorModuleGraph(workspaceRoot, 'rsdoctor-data.json');

  const product = await resolveProductRoots(
    workspaceRoot,
    context('ctx_app', 'application'),
    graph,
  );

  expect(product.contextId).toBe('ctx_app');
  expect(product.packageRoot).toBe('.');
  expect(product.product).toBe('application');
  expect(product.contractTargets).toEqual([]);
  expect(product.roots.map(({ kind, module }) => [kind, module.id])).toEqual([
    ['production-entry', '1'],
    ['side-effect', '4'],
    ['conservative-runtime', '8'],
    ['conservative-runtime', '5'],
  ]);
  expect(product.bounds).toEqual([
    'export-usage-schema-unsupported',
    'duplicate-module-id',
    'dangling-edge',
  ]);
});

test('collects library contracts and seeds only exact runtime module matches', async () => {
  const workspaceRoot = path.join(fixtureRoot, 'library');
  const graph = await readRsdoctorModuleGraph(workspaceRoot, 'rsdoctor-data.json');

  const product = await resolveProductRoots(
    workspaceRoot,
    context('ctx_library', 'library'),
    graph,
  );

  expect(product.contractTargets).toEqual([
    { field: 'bin', target: './dist/cli.js', matchedModuleIds: ['14'] },
    { field: 'exports', target: './dist/feature.js', matchedModuleIds: ['11'] },
    { field: 'exports', target: './dist/generated.js', matchedModuleIds: [] },
    { field: 'exports', target: './dist/index.d.ts', matchedModuleIds: [] },
    { field: 'exports', target: './dist/index.js', matchedModuleIds: ['10'] },
    { field: 'main', target: './dist/index.js', matchedModuleIds: ['10'] },
    { field: 'module', target: './dist/index.js', matchedModuleIds: ['10'] },
    { field: 'types', target: './dist/index.d.ts', matchedModuleIds: [] },
  ]);
  expect(product.roots.map(({ kind, module }) => [kind, module.id])).toEqual([
    ['production-entry', '11'],
    ['production-entry', '10'],
    ['published-contract', '14'],
    ['published-contract', '11'],
    ['published-contract', '10'],
  ]);
  expect(product.bounds).toEqual([
    'unmapped-contract-target:exports:./dist/generated.js',
    'unmapped-contract-target:exports:./dist/index.d.ts',
    'unmapped-contract-target:types:./dist/index.d.ts',
    'published-library-open-world',
  ]);
});

test('does not match a library contract to a dependency with the same output suffix', async () => {
  const workspaceRoot = path.join(fixtureRoot, 'library');
  const graph = await readRsdoctorModuleGraph(workspaceRoot, 'rsdoctor-data.json');
  graph.modules.push({
    id: '99',
    path: '/repo/node_modules/other-library/dist/index.js',
    name: 'other-library',
    chunks: ['other-library'],
    isEntry: false,
  });

  const product = await resolveProductRoots(
    workspaceRoot,
    context('ctx_library', 'library'),
    graph,
  );

  expect(
    product.contractTargets.find(
      ({ field, target }) => field === 'exports' && target === './dist/index.js',
    )?.matchedModuleIds,
  ).toEqual(['10']);
  expect(product.roots.some(({ module }) => module.id === '99')).toBe(false);
});

test('matches a library contract only within the selected monorepo package', async () => {
  const graph = await readRsdoctorModuleGraph(
    path.join(fixtureRoot, 'library'),
    'rsdoctor-data.json',
  );
  graph.modules.push({
    id: '99',
    path: '/repo/packages/other-library/dist/index.js',
    name: 'other-library',
    chunks: ['other-library'],
    isEntry: false,
  });

  const product = await resolveProductRoots(
    fixtureRoot,
    { ...context('ctx_library', 'library'), packageRoot: 'library' },
    graph,
  );

  expect(
    product.contractTargets.find(
      ({ field, target }) => field === 'exports' && target === './dist/index.js',
    )?.matchedModuleIds,
  ).toEqual(['10']);
  expect(product.packageRoot).toBe('library');
});

test('does not guess generated output to source module mappings', async () => {
  const workspaceRoot = path.join(fixtureRoot, 'library');
  const graph = await readRsdoctorModuleGraph(workspaceRoot, 'rsdoctor-data.json');
  const product = await resolveProductRoots(
    workspaceRoot,
    context('ctx_library', 'library'),
    graph,
  );

  expect(
    product.contractTargets.find(({ target }) => target === './dist/generated.js')
      ?.matchedModuleIds,
  ).toEqual([]);
  expect(product.roots.some(({ module }) => module.id === '13')).toBe(false);
});

test('bounds a library analysis when its package manifest is unavailable', async () => {
  const workspaceRoot = path.join(fixtureRoot, 'application');
  const graph = await readRsdoctorModuleGraph(workspaceRoot, 'rsdoctor-data.json');

  const product = await resolveProductRoots(
    workspaceRoot,
    { ...context('ctx_library', 'library'), packageRoot: 'missing-package' },
    graph,
  );

  expect(product.contractTargets).toEqual([]);
  expect(product.bounds).toContain('package-manifest-unavailable');
  expect(product.bounds).toContain('published-library-open-world');
});
