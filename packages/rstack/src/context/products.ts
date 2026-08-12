import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ContractField,
  ContractTarget,
  ObservedModule,
  ObservedModuleGraph,
  ProductRoot,
  ProductRootSet,
} from './analysisModel.ts';
import type { ContextDescriptor } from './model.ts';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const compareStrings = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

const collectStringLeaves = (value: unknown, targets: string[]): void => {
  if (typeof value === 'string') {
    targets.push(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) collectStringLeaves(entry, targets);
  } else if (isObject(value)) {
    for (const entry of Object.values(value)) collectStringLeaves(entry, targets);
  }
};

const readContractTargets = async (
  workspaceRoot: string,
  packageRoot: string,
): Promise<Array<{ field: ContractField; target: string }> | undefined> => {
  let manifest: unknown;
  try {
    manifest = JSON.parse(
      await readFile(path.join(workspaceRoot, packageRoot, 'package.json'), 'utf8'),
    );
  } catch {
    return undefined;
  }
  if (!isObject(manifest)) return undefined;

  const pairs: Array<{ field: ContractField; target: string }> = [];
  for (const field of ['exports', 'bin'] as const) {
    const targets: string[] = [];
    collectStringLeaves(manifest[field], targets);
    pairs.push(...targets.map((target) => ({ field, target })));
  }
  for (const field of ['main', 'module', 'types'] as const) {
    if (typeof manifest[field] === 'string') pairs.push({ field, target: manifest[field] });
  }

  const unique = new Map(pairs.map((pair) => [`${pair.field}\u0000${pair.target}`, pair]));
  return [...unique.values()].sort(
    (left, right) =>
      compareStrings(left.field, right.field) || compareStrings(left.target, right.target),
  );
};

const normalizeTarget = (value: string): string =>
  path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//u, '');

const matchesTarget = (module: ObservedModule, target: string, packageRoot: string): boolean => {
  const modulePath = normalizeTarget(module.path);
  const normalizedTarget = normalizeTarget(target);
  if (modulePath.split('/').includes('node_modules')) return false;
  const normalizedPackageRoot = normalizeTarget(packageRoot);
  const scopedTarget =
    normalizedPackageRoot === '.'
      ? normalizedTarget
      : normalizeTarget(`${normalizedPackageRoot}/${normalizedTarget}`);
  return modulePath === scopedTarget || modulePath.endsWith(`/${scopedTarget}`);
};

const toRootModule = ({
  isEntry: _,
  optimizerBound: __,
  optimizerReasons: ___,
  ...module
}: ObservedModule) => module;

const addRoot = (roots: ProductRoot[], root: ProductRoot): void => {
  if (roots.some(({ kind, module }) => kind === root.kind && module.id === root.module.id)) {
    return;
  }
  roots.push(root);
};

const resolveProductRoots = async (
  workspaceRoot: string,
  context: ContextDescriptor,
  graph: ObservedModuleGraph,
): Promise<ProductRootSet> => {
  if (context.product !== 'application' && context.product !== 'library') {
    throw new Error('Reachability requires an application or library context.');
  }

  const roots: ProductRoot[] = [];
  const bounds: string[] = [];
  const entries = graph.modules.filter(({ isEntry }) => isEntry);
  for (const module of entries) {
    addRoot(roots, {
      kind: 'production-entry',
      module: toRootModule(module),
      label: `entry: ${module.name}`,
    });
  }
  if (entries.length === 0) bounds.push('no-production-entry-roots');

  let contractTargets: ContractTarget[] = [];
  if (context.product === 'library') {
    const targets = await readContractTargets(workspaceRoot, context.packageRoot);
    if (targets === undefined) {
      bounds.push('package-manifest-unavailable');
    } else {
      contractTargets = targets.map(({ field, target }) => ({
        field,
        target,
        matchedModuleIds: graph.modules
          .filter((module) => matchesTarget(module, target, context.packageRoot))
          .map(({ id }) => id),
      }));
      for (const target of contractTargets) {
        if (target.matchedModuleIds.length === 0) {
          bounds.push(`unmapped-contract-target:${target.field}:${target.target}`);
          continue;
        }
        if (target.field === 'types') continue;
        for (const moduleId of target.matchedModuleIds) {
          const module = graph.modules.find(({ id }) => id === moduleId)!;
          addRoot(roots, {
            kind: 'published-contract',
            module: toRootModule(module),
            label: `package.json ${target.field}: ${target.target}`,
          });
        }
      }
    }
    bounds.push('published-library-open-world');
  }

  for (const module of graph.modules) {
    if (module.optimizerBound === 'side-effect') {
      addRoot(roots, {
        kind: 'side-effect',
        module: toRootModule(module),
        label: `side-effect bailout: ${module.name}`,
      });
    }
  }
  for (const module of graph.modules) {
    if (module.optimizerBound !== undefined && module.optimizerBound !== 'side-effect') {
      addRoot(roots, {
        kind: 'conservative-runtime',
        module: toRootModule(module),
        label: `${module.optimizerBound} bailout: ${module.name}`,
      });
    }
  }

  if (graph.exportRowsPresent) bounds.push('export-usage-schema-unsupported');
  bounds.push(...graph.issues);

  return {
    contextId: context.contextId,
    packageRoot: context.packageRoot,
    product: context.product,
    roots,
    contractTargets,
    bounds,
  };
};

export { resolveProductRoots };
