import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { JsonValue } from './model.ts';

const supportedToolNames = [
  'build_summary',
  'bundle_optimize',
  'chunks_list',
  'errors_list',
  'packages_direct_dependencies',
  'packages_duplicates',
  'packages_similar',
  'tree_shaking_retained_modules',
  'tree_shaking_side_effects',
  'tree_shaking_summary',
] as const;

type RsdoctorToolName = (typeof supportedToolNames)[number];

type RsdoctorToolDescriptor = {
  name: RsdoctorToolName;
  description: string;
  inputSchema: Record<string, JsonValue>;
};

type RsdoctorAnalysisRequest = {
  dataFile: string;
  toolName: string;
  input?: Record<string, unknown>;
};

type RsdoctorAnalysisResult = {
  toolName: string;
  dataFile: string;
  result: JsonValue;
};

type RsdoctorAdapter = {
  catalog: RsdoctorToolDescriptor[];
  executor: ReturnType<
    (typeof import('@rsdoctor/agent-cli'))['createInProcessRsdoctorCliToolExecutor']
  >;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSupportedToolName = (name: string): name is RsdoctorToolName =>
  supportedToolNames.some((supportedName) => supportedName === name);

let adapterPromise: Promise<RsdoctorAdapter> | undefined;

const loadAdapter = async (): Promise<RsdoctorAdapter> => {
  const { createInProcessRsdoctorCliToolExecutor, getToolCatalog } =
    await import('@rsdoctor/agent-cli');
  const packageCatalog = getToolCatalog();
  const catalog = supportedToolNames.map((name) => {
    const tool = packageCatalog.find((entry) => entry.name === name);
    if (tool === undefined) {
      throw new Error(`Rsdoctor catalog is missing ${name}.`);
    }

    return {
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, JsonValue>,
      name,
    };
  });

  return {
    catalog,
    executor: createInProcessRsdoctorCliToolExecutor(),
  };
};

const getAdapter = (): Promise<RsdoctorAdapter> => (adapterPromise ??= loadAdapter());

const listRsdoctorToolNames = (): RsdoctorToolName[] => [...supportedToolNames];

const matchesSchemaType = (value: unknown, type: unknown): boolean => {
  if (Array.isArray(type)) {
    return type.some((entry) => matchesSchemaType(value, entry));
  }

  switch (type) {
    case 'array':
      return Array.isArray(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'null':
      return value === null;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'object':
      return isObject(value);
    case 'string':
      return typeof value === 'string';
    default:
      return true;
  }
};

const matchesJsonSchema = (value: unknown, schema: unknown): boolean => {
  if (!isObject(schema) || !matchesSchemaType(value, schema.type)) {
    return false;
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      return false;
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      return false;
    }
  }

  if (Array.isArray(value) && isObject(schema.items)) {
    return value.every((entry) => matchesJsonSchema(entry, schema.items));
  }

  if (!isObject(value)) {
    return true;
  }

  const properties = isObject(schema.properties) ? schema.properties : {};
  if (
    Array.isArray(schema.required) &&
    schema.required.some((key) => typeof key === 'string' && !(key in value))
  ) {
    return false;
  }

  for (const [key, entry] of Object.entries(value)) {
    const propertySchema = properties[key];
    if (propertySchema !== undefined) {
      if (!matchesJsonSchema(entry, propertySchema)) {
        return false;
      }
    } else if (schema.additionalProperties === false) {
      return false;
    } else if (isObject(schema.additionalProperties)) {
      if (!matchesJsonSchema(entry, schema.additionalProperties)) {
        return false;
      }
    }
  }

  return true;
};

const getInput = (input: unknown, tool: RsdoctorToolDescriptor): Record<string, unknown> => {
  const resolvedInput = input === undefined ? {} : input;
  if (!isObject(resolvedInput) || !matchesJsonSchema(resolvedInput, tool.inputSchema)) {
    throw new Error('Rsdoctor tool input does not match its schema.');
  }

  return resolvedInput;
};

const readArtifact = async (workspaceRoot: string, dataFile: string): Promise<string> => {
  const artifactPath = path.resolve(workspaceRoot, dataFile);
  let contents: string;
  try {
    contents = await readFile(artifactPath, 'utf8');
  } catch {
    throw new Error('Rsdoctor data file could not be read.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error('Rsdoctor data file must contain valid JSON.');
  }

  if (!isObject(parsed) || !isObject(parsed.data)) {
    throw new Error('Rsdoctor data file must contain an object data field.');
  }

  return artifactPath;
};

const toRelativeWorkspaceFile = (workspaceRoot: string, file: string): string =>
  path.relative(workspaceRoot, file).split(path.sep).join('/');

const resolveRsdoctorDataFile = async (
  workspaceRoot: string,
  dataFile: string,
): Promise<string> => {
  const artifactPath = await readArtifact(workspaceRoot, dataFile);
  return toRelativeWorkspaceFile(workspaceRoot, artifactPath);
};

const analyzeRsdoctorArtifact = async (
  workspaceRoot: string,
  request: RsdoctorAnalysisRequest,
): Promise<RsdoctorAnalysisResult> => {
  if (!isObject(request) || typeof request.toolName !== 'string' || !request.toolName) {
    throw new Error('Rsdoctor tool name is invalid.');
  }
  if (!isSupportedToolName(request.toolName)) {
    throw new Error('Unknown Rsdoctor tool.');
  }

  const { catalog, executor } = await getAdapter();
  const tool = catalog.find(({ name }) => name === request.toolName)!;
  const input = getInput(request.input, tool);
  const artifactPath = await readArtifact(workspaceRoot, request.dataFile);

  let result: unknown;
  try {
    result = await executor.execute({
      dataFile: artifactPath,
      input,
      toolName: request.toolName,
    });
  } catch {
    throw new Error('Rsdoctor analysis failed.');
  }

  return {
    dataFile: request.dataFile,
    result: result as JsonValue,
    toolName: request.toolName,
  };
};

export { analyzeRsdoctorArtifact, listRsdoctorToolNames, resolveRsdoctorDataFile };
export type { RsdoctorAnalysisRequest, RsdoctorAnalysisResult };
