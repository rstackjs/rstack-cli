import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { resolveRsdoctorArtifact } from './rsdoctor.ts';

type RsdoctorReport = {
  kind: 'html' | 'manifest';
  path: string;
  uri: string;
};

type RsdoctorReportResult =
  | {
      dataFile: string;
      report: RsdoctorReport;
    }
  | {
      nextCommand: string;
      dataFile: string;
      reason: string;
    };

const quotePosixArgument = (argument: string): string => `'${argument.replaceAll("'", "'\\''")}'`;

const rstackPackagePath = 'packages/rstack';

const inspectCommand = (dataFile: string): string =>
  `pnpm --filter rstack exec rsdoctor-agent query build_summary --data-file ${quotePosixArgument(path.posix.relative(rstackPackagePath, dataFile))}`;

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
      nextCommand: inspectCommand(artifact.dataFile),
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
    nextCommand: inspectCommand(artifact.dataFile),
    dataFile: artifact.dataFile,
    reason:
      'No contained Rsdoctor HTML or manifest report artifact was found. The command inspects data and does not generate a report.',
  };
};

export { resolveRsdoctorReport };
export type { RsdoctorReport, RsdoctorReportResult };
