import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createInProcessRsdoctorCliToolExecutor, getToolCatalog } from '@rsdoctor/agent-cli';
import type { JsonValue } from './model.ts';

const maxArtifactBytes = 64 * 1024 * 1024;
const maxResultBytes = 1024 * 1024;
const rsdoctorDataFileName = 'rsdoctor-data.json';
const absolutePathPattern =
  /(?<![a-zA-Z0-9._/:\\-])\/(?:[^\s"'`<>()[\]{},;:!?]+\/)*[^\s"'`<>()[\]{},;:!?]+|[a-zA-Z]:[\\/](?:[^\s"'`<>()[\]{},;:!?]+[\\/])*[^\s"'`<>()[\]{},;:!?]+/gu;
const environmentAssignmentPattern = /\b[A-Z][A-Z0-9_]{1,}\s*=\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gu;
const secretAssignmentPattern =
  /\b(?:[a-z0-9]+[_-])?(?:api[_-]?key|token|secret|password|passwd|private[_-]?key)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu;
const sensitiveKeyFragments = [
  'apikey',
  'authorization',
  'auth',
  'bearer',
  'config',
  'configuration',
  'content',
  'contents',
  'environment',
  'env',
  'password',
  'passwd',
  'privatekey',
  'processenv',
  'secret',
  'source',
  'sourcemap',
  'sourcecontent',
  'token',
];

type RsdoctorToolDescriptor = {
  name: string;
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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isAbsolutePath = (value: string): boolean =>
  path.isAbsolute(value) || path.win32.isAbsolute(value);

const containsAbsolutePath = (value: string): boolean => {
  absolutePathPattern.lastIndex = 0;
  const matches = absolutePathPattern.test(value);
  absolutePathPattern.lastIndex = 0;
  return matches;
};

const isSensitiveKey = (key: string): boolean => {
  const normalized = key.replaceAll(/[^a-zA-Z0-9]/gu, '').toLowerCase();
  return sensitiveKeyFragments.some((fragment) => normalized.includes(fragment));
};

const sanitizeText = (value: string): string =>
  value
    .replace(absolutePathPattern, '<redacted absolute path>')
    .replace(secretAssignmentPattern, '<redacted secret>')
    .replace(environmentAssignmentPattern, '<redacted environment value>');

const toJsonValue = (
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  sanitizeUntrustedValues = false,
): JsonValue => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return sanitizeUntrustedValues && typeof value === 'string' ? sanitizeText(value) : value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Rsdoctor result contains a non-JSON number.');
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new Error('Rsdoctor result contains a circular value.');
    }
    seen.add(value);
    const cloned = value.map((entry) => toJsonValue(entry, seen, sanitizeUntrustedValues));
    seen.delete(value);
    return Object.freeze(cloned) as JsonValue;
  }

  if (isObject(value)) {
    if (seen.has(value)) {
      throw new Error('Rsdoctor result contains a circular value.');
    }
    seen.add(value);
    const cloned: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (
        entry === undefined ||
        (sanitizeUntrustedValues && (containsAbsolutePath(key) || isSensitiveKey(key)))
      ) {
        continue;
      }
      Object.defineProperty(cloned, key, {
        configurable: false,
        enumerable: true,
        value: toJsonValue(entry, seen, sanitizeUntrustedValues),
        writable: false,
      });
    }
    seen.delete(value);
    return Object.freeze(cloned) as JsonValue;
  }

  throw new Error('Rsdoctor result contains a non-JSON value.');
};

const toolCatalog = Object.freeze(
  getToolCatalog()
    .map(({ description, inputSchema, name }) =>
      Object.freeze({
        description,
        inputSchema: toJsonValue(inputSchema) as Record<string, JsonValue>,
        name,
      }),
    )
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)),
);

const listRsdoctorTools = (): RsdoctorToolDescriptor[] => [...toolCatalog];

let executor: ReturnType<typeof createInProcessRsdoctorCliToolExecutor> | undefined;

const getExecutor = (): ReturnType<typeof createInProcessRsdoctorCliToolExecutor> =>
  (executor ??= createInProcessRsdoctorCliToolExecutor());

const getRelativeDataFile = (dataFile: unknown): string => {
  if (
    typeof dataFile !== 'string' ||
    dataFile.length === 0 ||
    dataFile.includes('\\') ||
    isAbsolutePath(dataFile) ||
    dataFile !== path.posix.normalize(dataFile) ||
    dataFile.split('/').includes('..')
  ) {
    throw new Error('Rsdoctor data file must be a normalized relative path.');
  }

  if (path.posix.basename(dataFile) !== rsdoctorDataFileName) {
    throw new Error('Rsdoctor data file must be named rsdoctor-data.json.');
  }

  return dataFile;
};

const isWithin = (parent: string, candidate: string): boolean => {
  const relative = path.relative(parent, candidate);
  return (
    relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !isAbsolutePath(relative)
  );
};

const resolveWorkspaceRoot = async (workspaceRoot: unknown): Promise<string> => {
  if (typeof workspaceRoot !== 'string' || workspaceRoot.length === 0) {
    throw new Error('Rsdoctor workspace root is invalid.');
  }

  try {
    return await realpath(workspaceRoot);
  } catch {
    throw new Error('Rsdoctor workspace root could not be resolved.');
  }
};

const readArtifact = async (workspaceRoot: string, dataFile: string): Promise<string> => {
  const candidate = path.resolve(workspaceRoot, dataFile);
  if (!isWithin(workspaceRoot, candidate)) {
    throw new Error('Rsdoctor data file must stay within the workspace.');
  }

  let resolvedArtifact: string;
  try {
    resolvedArtifact = await realpath(candidate);
  } catch {
    throw new Error('Rsdoctor data file could not be resolved.');
  }

  if (!isWithin(workspaceRoot, resolvedArtifact)) {
    throw new Error('Rsdoctor data file must stay within the workspace.');
  }

  let fileStats: Awaited<ReturnType<typeof lstat>>;
  try {
    fileStats = await lstat(resolvedArtifact);
  } catch {
    throw new Error('Rsdoctor data file could not be read.');
  }

  if (!fileStats.isFile()) {
    throw new Error('Rsdoctor data file must be a regular file.');
  }

  if (fileStats.size > maxArtifactBytes) {
    throw new Error('Rsdoctor data file exceeds the 64 MiB limit.');
  }

  let contents: Buffer;
  try {
    contents = await readFile(resolvedArtifact);
  } catch {
    throw new Error('Rsdoctor data file could not be read.');
  }

  if (contents.byteLength > maxArtifactBytes) {
    throw new Error('Rsdoctor data file exceeds the 64 MiB limit.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents.toString('utf8'));
  } catch {
    throw new Error('Rsdoctor data file must contain valid JSON.');
  }

  if (!isObject(parsed) || !isObject(parsed.data)) {
    throw new Error('Rsdoctor data file must contain an object data field.');
  }

  return resolvedArtifact;
};

const getInput = (input: unknown): Record<string, unknown> => {
  if (input === undefined) {
    return {};
  }

  if (!isObject(input)) {
    throw new Error('Rsdoctor tool input must be an object.');
  }

  return input;
};

const analyzeRsdoctorArtifact = async (
  workspaceRoot: string,
  request: RsdoctorAnalysisRequest,
): Promise<RsdoctorAnalysisResult> => {
  if (!isObject(request) || typeof request.toolName !== 'string' || !request.toolName) {
    throw new Error('Rsdoctor tool name is invalid.');
  }

  if (!toolCatalog.some((tool) => tool.name === request.toolName)) {
    throw new Error('Unknown Rsdoctor tool.');
  }

  const relativeDataFile = getRelativeDataFile(request.dataFile);
  const canonicalWorkspaceRoot = await resolveWorkspaceRoot(workspaceRoot);
  const artifactPath = await readArtifact(canonicalWorkspaceRoot, relativeDataFile);
  const input = getInput(request.input);

  let rawResult: unknown;
  try {
    rawResult = await getExecutor().execute({
      dataFile: artifactPath,
      input,
      toolName: request.toolName,
    });
  } catch {
    throw new Error('Rsdoctor analysis failed.');
  }

  let result: JsonValue;
  try {
    result = toJsonValue(rawResult, new WeakSet(), true);
  } catch {
    throw new Error('Rsdoctor analysis result is not JSON-safe.');
  }

  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > maxResultBytes) {
    throw new Error(
      'Rsdoctor analysis result exceeds the 1 MiB limit. Use filter, page, or pageSize to reduce the response.',
    );
  }

  return {
    dataFile: path.relative(canonicalWorkspaceRoot, artifactPath).split(path.sep).join('/'),
    result,
    toolName: request.toolName,
  };
};

export { analyzeRsdoctorArtifact, listRsdoctorTools };
export type { RsdoctorAnalysisRequest, RsdoctorAnalysisResult, RsdoctorToolDescriptor };
