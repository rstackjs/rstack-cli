import path from 'node:path';
import type { ObservedModule, ObservedModuleGraph, OptimizerBound } from './analysisModel.ts';
import { readRsdoctorArtifact, type RsdoctorArtifact } from './rsdoctor.ts';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const compareStrings = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const getId = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0
    ? value
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : undefined;

const normalizeModulePath = (value: string): string =>
  path.posix.normalize(value.replaceAll('\\', '/'));

const stringifyBailoutReason = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(stringifyBailoutReason).join(' ');
  }
  if (!isObject(value)) {
    return '';
  }

  const preferredFields = ['reason', 'message', 'description', 'detail', 'title', 'type', 'code'];
  const preferredText = preferredFields
    .map((field) => value[field])
    .filter((entry) => entry !== undefined)
    .map(stringifyBailoutReason)
    .filter(Boolean)
    .join(' ');
  return preferredText || JSON.stringify(value);
};

const getOptimizerReasons = (value: unknown): string[] | undefined => {
  const reasons = [...new Set((Array.isArray(value) ? value : [value]).map(stringifyBailoutReason))]
    .filter(Boolean)
    .sort(compareStrings);
  return reasons.length === 0 ? undefined : reasons;
};

const getOptimizerBound = (value: unknown): OptimizerBound | undefined => {
  const reason = stringifyBailoutReason(value).toLowerCase();
  if (!reason) return undefined;
  if (
    reason.includes('cjs') ||
    reason.includes('commonjs') ||
    reason.includes('require(') ||
    reason.includes('require()') ||
    reason.includes('module.exports') ||
    reason.includes('exports.')
  ) {
    return 'cjs';
  }
  if (/side[_ -]?effects?/u.test(reason)) return 'side-effect';
  if (reason.includes('dynamic import') || reason.includes('import()')) {
    return 'dynamic-import';
  }
  return 'unknown-bailout';
};

const normalizeModule = (value: unknown): ObservedModule | undefined => {
  if (!isObject(value)) return undefined;
  const id = getId(value.id);
  if (id === undefined) return undefined;

  const rawPath =
    getString(value.path) ?? getString(value.webpackId) ?? getString(value.name) ?? '';
  const rawName = getString(value.webpackId) ?? getString(value.name) ?? rawPath;
  const chunks = Array.isArray(value.chunks)
    ? [
        ...new Set(value.chunks.map(getId).filter((entry): entry is string => entry !== undefined)),
      ].sort(compareStrings)
    : [];
  const optimizerReasons = getOptimizerReasons(value.bailoutReason);
  const optimizerBound = getOptimizerBound(optimizerReasons);

  return {
    id,
    path: normalizeModulePath(rawPath),
    name: rawName.replaceAll('\\', '/'),
    chunks,
    isEntry: value.isEntry === true,
    ...(optimizerBound === undefined ? {} : { optimizerBound }),
    ...(optimizerReasons === undefined ? {} : { optimizerReasons }),
  };
};

const compareModules = (left: ObservedModule, right: ObservedModule): number =>
  compareStrings(left.path, right.path) ||
  compareStrings(left.name, right.name) ||
  compareStrings(left.id, right.id);

const normalizeRsdoctorModuleGraph = (artifact: RsdoctorArtifact): ObservedModuleGraph => {
  if (artifact.metadata?.sections.moduleGraph?.status === 'omitted') {
    return {
      modules: [],
      edges: [],
      exportRowsPresent: false,
      issues: ['module-graph-omitted'],
    };
  }

  const moduleGraph = artifact.data.moduleGraph;
  if (!isObject(moduleGraph)) {
    return {
      modules: [],
      edges: [],
      exportRowsPresent: false,
      issues: ['module-graph-missing'],
    };
  }

  const issues: ObservedModuleGraph['issues'] = [];
  const modulesById = new Map<string, ObservedModule>();
  for (const row of Array.isArray(moduleGraph.modules) ? moduleGraph.modules : []) {
    const module = normalizeModule(row);
    if (module === undefined) continue;
    if (modulesById.has(module.id)) {
      if (!issues.includes('duplicate-module-id')) issues.push('duplicate-module-id');
      continue;
    }
    modulesById.set(module.id, module);
  }

  for (const row of Array.isArray(moduleGraph.modules) ? moduleGraph.modules : []) {
    if (!isObject(row) || !Array.isArray(row.modules)) continue;
    const container = modulesById.get(getId(row.id) ?? '');
    if (container === undefined || container.chunks.length === 0) continue;
    for (const childId of row.modules.map(getId)) {
      if (childId === undefined) continue;
      const child = modulesById.get(childId);
      if (child === undefined) continue;
      modulesById.set(childId, {
        ...child,
        chunks: [...new Set([...child.chunks, ...container.chunks])].sort(compareStrings),
      });
    }
  }

  const edgeKeys = new Set<string>();
  const edges: ObservedModuleGraph['edges'] = [];
  for (const row of Array.isArray(moduleGraph.dependencies) ? moduleGraph.dependencies : []) {
    if (!isObject(row)) continue;
    const usesDependencyShape = Object.hasOwn(row, 'dependency');
    const from = getId(usesDependencyShape ? row.module : row.issuer);
    const to = getId(usesDependencyShape ? row.dependency : row.module);
    if (from === undefined || to === undefined) continue;
    if (!modulesById.has(from) || !modulesById.has(to)) {
      if (!issues.includes('dangling-edge')) issues.push('dangling-edge');
      continue;
    }
    const key = `${from}\u0000${to}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({ from, to });
  }

  return {
    modules: [...modulesById.values()].sort(compareModules),
    edges: edges.sort(
      (left, right) => compareStrings(left.from, right.from) || compareStrings(left.to, right.to),
    ),
    exportRowsPresent: Array.isArray(moduleGraph.exports) && moduleGraph.exports.length > 0,
    issues,
  };
};

const readRsdoctorModuleGraph = async (
  workspaceRoot: string,
  dataFile: string,
): Promise<ObservedModuleGraph> => {
  const artifact = await readRsdoctorArtifact(workspaceRoot, dataFile);
  return normalizeRsdoctorModuleGraph(artifact);
};

export { normalizeRsdoctorModuleGraph, readRsdoctorModuleGraph };
