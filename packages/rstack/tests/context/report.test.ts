import { exec as execCallback } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from 'rstack/test';
import { resolveRsdoctorReport } from '../../src/context/report.ts';
import { resolveRsdoctorArtifact } from '../../src/context/rsdoctor.ts';

const validDataFile = 'artifacts/rsdoctor-data.json';
const exec = promisify(execCallback);

const withTempWorkspace = async (
  callback: (workspaceRoot: string) => Promise<void>,
): Promise<void> => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-rsdoctor-report-'));

  try {
    await callback(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
};

const withCheckoutWorkspace = async (
  callback: (checkoutRoot: string, workspaceRoot: string) => Promise<void>,
): Promise<void> => {
  const checkoutRoot = await realpath(path.resolve(process.cwd(), '../..'));
  const workspaceRoot = await mkdtemp(path.join(checkoutRoot, ".rstack-rsdoctor-report-' space-"));

  try {
    await callback(checkoutRoot, workspaceRoot);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
};

const writeWorkspaceFile = async (
  workspaceRoot: string,
  relativeFile: string,
  contents: string,
): Promise<string> => {
  const filePath = path.join(workspaceRoot, relativeFile);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
  return filePath;
};

const writeDataFile = async (workspaceRoot: string): Promise<void> => {
  await writeWorkspaceFile(workspaceRoot, validDataFile, '{"data":{}}');
};

test('resolves the conventional sibling HTML report before other report candidates', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeDataFile(workspaceRoot);
    const reportPath = await writeWorkspaceFile(
      workspaceRoot,
      'artifacts/report-rsdoctor.html',
      '<html></html>',
    );

    await expect(resolveRsdoctorReport(workspaceRoot, validDataFile)).resolves.toEqual({
      dataFile: validDataFile,
      report: {
        kind: 'html',
        path: 'artifacts/report-rsdoctor.html',
        uri: pathToFileURL(reportPath).toString(),
      },
    });
  });
});

test('resolves one custom sibling HTML report when the conventional report is absent', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeDataFile(workspaceRoot);
    const reportPath = await writeWorkspaceFile(
      workspaceRoot,
      'artifacts/custom-report.html',
      '<html></html>',
    );

    await expect(resolveRsdoctorReport(workspaceRoot, validDataFile)).resolves.toEqual({
      dataFile: validDataFile,
      report: {
        kind: 'html',
        path: 'artifacts/custom-report.html',
        uri: pathToFileURL(reportPath).toString(),
      },
    });
  });
});

test('resolves the normal workspace .rsdoctor manifest when no sibling HTML report exists', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeDataFile(workspaceRoot);
    const manifestPath = await writeWorkspaceFile(
      workspaceRoot,
      '.rsdoctor/manifest.json',
      '{"version":1}',
    );

    await expect(resolveRsdoctorReport(workspaceRoot, validDataFile)).resolves.toEqual({
      dataFile: validDataFile,
      report: {
        kind: 'manifest',
        path: '.rsdoctor/manifest.json',
        uri: pathToFileURL(manifestPath).toString(),
      },
    });
  });
});

test('returns a safe no-report response for ambiguous sibling HTML reports', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeDataFile(workspaceRoot);
    await writeWorkspaceFile(workspaceRoot, 'artifacts/first.html', '<html></html>');
    await writeWorkspaceFile(workspaceRoot, 'artifacts/second.html', '<html></html>');

    await expect(resolveRsdoctorReport(workspaceRoot, validDataFile)).resolves.toEqual({
      nextCommand: `pnpm --filter rstack exec rsdoctor-agent query build_summary --data-file '../../${validDataFile}'`,
      dataFile: validDataFile,
      reason: 'Multiple sibling HTML reports were found; select one explicitly.',
    });
  });
});

test('returns a safe no-report response when no report artifact exists', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeDataFile(workspaceRoot);

    await expect(resolveRsdoctorReport(workspaceRoot, validDataFile)).resolves.toEqual({
      nextCommand: `pnpm --filter rstack exec rsdoctor-agent query build_summary --data-file '../../${validDataFile}'`,
      dataFile: validDataFile,
      reason:
        'No contained Rsdoctor HTML or manifest report artifact was found. The command inspects data and does not generate a report.',
    });
  });
});

test('returns a checkout-executable static inspection command for an apostrophe-and-space path', async () => {
  await withCheckoutWorkspace(async (checkoutRoot, workspaceRoot) => {
    await writeDataFile(workspaceRoot);
    const dataFile = path
      .relative(checkoutRoot, path.join(workspaceRoot, validDataFile))
      .split(path.sep)
      .join('/');

    const result = await resolveRsdoctorReport(checkoutRoot, dataFile);

    if (!('nextCommand' in result)) {
      throw new Error('Expected a static Rsdoctor inspection command.');
    }

    expect(result.dataFile).toBe(dataFile);
    expect(result.nextCommand).toMatch(
      /^pnpm --filter rstack exec rsdoctor-agent query build_summary --data-file '/u,
    );
    expect(result.nextCommand).toContain("\\'");
    expect(result.nextCommand).not.toContain(checkoutRoot);

    const { stdout } = await exec(result.nextCommand, { cwd: checkoutRoot });

    expect(JSON.parse(stdout)).toMatchObject({ ok: true });
  });
});

test('rejects an escaping report symlink without exposing workspace paths', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const externalRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-rsdoctor-report-external-'));

    try {
      await writeDataFile(workspaceRoot);
      const externalReport = await writeWorkspaceFile(
        externalRoot,
        'report-rsdoctor.html',
        '<html></html>',
      );
      const reportSymlink = path.join(workspaceRoot, 'artifacts', 'report-rsdoctor.html');
      await symlink(externalReport, reportSymlink);

      let error: unknown;
      try {
        await resolveRsdoctorReport(workspaceRoot, validDataFile);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('within the workspace');
      expect((error as Error).message).not.toContain(workspaceRoot);
      expect((error as Error).message).not.toContain(externalRoot);
    } finally {
      await rm(externalRoot, { force: true, recursive: true });
    }
  });
});

test('rejects an escaping custom sibling report symlink without exposing workspace paths', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const externalRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-rsdoctor-report-external-'));

    try {
      await writeDataFile(workspaceRoot);
      const externalReport = await writeWorkspaceFile(
        externalRoot,
        'custom-report.html',
        '<html></html>',
      );
      const reportSymlink = path.join(workspaceRoot, 'artifacts', 'custom-report.html');
      await symlink(externalReport, reportSymlink);

      let error: unknown;
      try {
        await resolveRsdoctorReport(workspaceRoot, validDataFile);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('within the workspace');
      expect((error as Error).message).not.toContain(workspaceRoot);
      expect((error as Error).message).not.toContain(externalRoot);
    } finally {
      await rm(externalRoot, { force: true, recursive: true });
    }
  });
});

test('keeps the exported artifact validation boundary relative and workspace-contained', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const artifactPath = await writeWorkspaceFile(workspaceRoot, validDataFile, '{"data":{}}');

    let error: unknown;
    try {
      await resolveRsdoctorArtifact(workspaceRoot, artifactPath);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('relative path');
    expect((error as Error).message).not.toContain(workspaceRoot);
  });
});
