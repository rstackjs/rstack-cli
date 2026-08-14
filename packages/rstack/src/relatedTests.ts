import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { RelatedTestRequest } from '@rstackjs/context/rstest';

type RelatedTestCliRequest = {
  cwd: string;
  args: string[];
};

type RelatedTestCliResult = {
  stdout: string;
  stderr: string;
};

type RelatedTestResolverDependencies = {
  runCli?: (request: RelatedTestCliRequest) => Promise<RelatedTestCliResult>;
};

type RelatedTestListEntry = { file: string };

const isRelatedTestListEntry = (value: unknown): value is RelatedTestListEntry =>
  typeof value === 'object' && value !== null && 'file' in value && typeof value.file === 'string';

const runCli = ({ cwd, args }: RelatedTestCliRequest): Promise<RelatedTestCliResult> =>
  new Promise((resolve, reject) => {
    execFile(process.execPath, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(error instanceof Error ? error : new Error('Rstack test list failed.'));
        return;
      }
      resolve({ stdout, stderr });
    });
  });

const resolveRelatedTests = async (
  request: RelatedTestRequest,
  dependencies: RelatedTestResolverDependencies = {},
): Promise<string[]> => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'rstack-related-tests-'));
  const outputFile = path.join(outputDirectory, 'tests.json');
  let source: string;
  let stderr: string;
  try {
    const args = [
      path.join(import.meta.dirname, '..', 'bin', 'rs.js'),
      'test',
      'list',
      '--related',
      ...request.sources,
      '--filesOnly',
      '--json',
      outputFile,
      ...(request.configPath === undefined ? [] : ['--config', request.configPath]),
    ];
    ({ stderr } = await (dependencies.runCli ?? runCli)({
      cwd: request.packageRoot,
      args,
    }));
    source = await readFile(outputFile, 'utf8');
  } finally {
    await rm(outputDirectory, { force: true, recursive: true });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(
      `Rstest related-test listing returned invalid JSON${stderr.length === 0 ? '.' : `: ${stderr.trim()}`}`,
    );
  }
  if (!Array.isArray(parsed) || !parsed.every(isRelatedTestListEntry)) {
    throw new Error('Rstest related-test listing returned an invalid file list.');
  }

  return [...new Set(parsed.map((entry) => path.resolve(request.packageRoot, entry.file)))].sort(
    (left, right) => left.localeCompare(right),
  );
};

export { resolveRelatedTests };
export type { RelatedTestResolverDependencies };
