import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { resolveRsdoctorArtifact } from './rsdoctor.ts';

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
  const artifact = await resolveRsdoctorArtifact(workspaceRoot, dataFile);
  const dataDirectory = path.posix.dirname(artifact.dataFile);
  const conventionalReport = path.posix.join(dataDirectory, 'report-rsdoctor.html');

  const createReport = async (
    file: string,
    kind: RsdoctorReport['kind'],
  ): Promise<RsdoctorReport> => {
    const containedFile = await artifact.resolveContainedReportFile(file);
    return {
      kind,
      path: containedFile.path,
      uri: containedFile.uri,
    };
  };

  try {
    return {
      dataFile: artifact.dataFile,
      report: await createReport(conventionalReport, 'html'),
    };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('could not be resolved')) {
      throw error;
    }
  }

  const htmlReports = await getSiblingHtmlReports(path.resolve(workspaceRoot, dataDirectory));
  if (htmlReports.length === 1) {
    return {
      dataFile: artifact.dataFile,
      report: await createReport(path.posix.join(dataDirectory, htmlReports[0]), 'html'),
    };
  }

  if (htmlReports.length > 1) {
    return {
      nextAction: createRsdoctorAnalyzeNextAction(artifact.dataFile),
      dataFile: artifact.dataFile,
      reason: 'Multiple sibling HTML reports were found; select one explicitly.',
    };
  }

  try {
    return {
      dataFile: artifact.dataFile,
      report: await createReport('.rsdoctor/manifest.json', 'manifest'),
    };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('could not be resolved')) {
      throw error;
    }
  }

  return {
    nextAction: createRsdoctorAnalyzeNextAction(artifact.dataFile),
    dataFile: artifact.dataFile,
    reason:
      'No GUI report was found; a GUI report is optional. Use rsdoctor_analyze for static inspection.',
  };
};

export { resolveRsdoctorReport };
export type { RsdoctorReport, RsdoctorReportResult };
