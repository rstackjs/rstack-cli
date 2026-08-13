import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveRsdoctorDataFile } from './rsdoctor.ts';

type ReportFileResult =
  | { kind: 'missing' }
  | {
      kind: 'file';
      path: string;
      uri: string;
    };

type RsdoctorReport = {
  kind: 'html' | 'manifest';
  path: string;
  uri: string;
};

type RsdoctorAnalyzeNextAction = {
  arguments: {
    dataFile: string;
    input: Record<string, never>;
    toolName: 'build_summary';
  };
  tool: 'rsdoctor_analyze';
};

type RsdoctorReportResult =
  | {
      dataFile: string;
      report: RsdoctorReport;
    }
  | {
      dataFile: string;
      nextAction: RsdoctorAnalyzeNextAction;
      reason: string;
    };

const createRsdoctorAnalyzeNextAction = (dataFile: string): RsdoctorAnalyzeNextAction => ({
  arguments: { dataFile, input: {}, toolName: 'build_summary' },
  tool: 'rsdoctor_analyze',
});

const resolveReportFile = async (
  workspaceRoot: string,
  file: string,
): Promise<ReportFileResult> => {
  const resolvedFile = path.resolve(workspaceRoot, file);
  try {
    const fileStats = await stat(resolvedFile);
    if (!fileStats.isFile()) {
      return { kind: 'missing' };
    }
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    ) {
      return { kind: 'missing' };
    }
    throw error;
  }

  return {
    kind: 'file',
    path: path.relative(workspaceRoot, resolvedFile).split(path.sep).join('/'),
    uri: pathToFileURL(resolvedFile).toString(),
  };
};

const getSiblingHtmlReports = async (directory: string): Promise<string[]> => {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith('.html'))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
};

const resolveRsdoctorReport = async (
  workspaceRoot: string,
  dataFile: string,
): Promise<RsdoctorReportResult> => {
  const resolvedDataFile = await resolveRsdoctorDataFile(workspaceRoot, dataFile);
  const dataDirectory = path.posix.dirname(resolvedDataFile);
  const conventionalReport = path.posix.join(dataDirectory, 'report-rsdoctor.html');

  const createReport = async (
    file: string,
    kind: RsdoctorReport['kind'],
  ): Promise<RsdoctorReport | undefined> => {
    const result = await resolveReportFile(workspaceRoot, file);
    if (result.kind === 'missing') {
      return undefined;
    }
    return {
      kind,
      path: result.path,
      uri: result.uri,
    };
  };

  const conventional = await createReport(conventionalReport, 'html');
  if (conventional !== undefined) {
    return {
      dataFile: resolvedDataFile,
      report: conventional,
    };
  }

  const htmlReports = await getSiblingHtmlReports(path.resolve(workspaceRoot, dataDirectory));
  if (htmlReports.length === 1) {
    const sibling = await createReport(path.posix.join(dataDirectory, htmlReports[0]), 'html');
    if (sibling !== undefined) {
      return {
        dataFile: resolvedDataFile,
        report: sibling,
      };
    }
  }

  if (htmlReports.length > 1) {
    return {
      nextAction: createRsdoctorAnalyzeNextAction(resolvedDataFile),
      dataFile: resolvedDataFile,
      reason: 'Multiple sibling HTML reports were found; select one explicitly.',
    };
  }

  const manifest = await createReport('.rsdoctor/manifest.json', 'manifest');
  if (manifest !== undefined) {
    return {
      dataFile: resolvedDataFile,
      report: manifest,
    };
  }

  return {
    nextAction: createRsdoctorAnalyzeNextAction(resolvedDataFile),
    dataFile: resolvedDataFile,
    reason:
      'No GUI report was found; a GUI report is optional. Use rsdoctor_analyze for static inspection.',
  };
};

export { resolveReportFile, resolveRsdoctorReport };
export type { ReportFileResult, RsdoctorReport, RsdoctorReportResult };
