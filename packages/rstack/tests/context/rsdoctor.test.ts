import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { analyzeRsdoctorArtifact, listRsdoctorTools } from '../../src/context/index.ts';

const validDataFile = 'artifacts/rsdoctor-data.json';

const withTempWorkspace = async (
  callback: (workspaceRoot: string) => Promise<void>,
): Promise<void> => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-rsdoctor-'));

  try {
    await callback(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
};

const writeArtifact = async (
  workspaceRoot: string,
  dataFile: string,
  contents: string,
): Promise<string> => {
  const artifactPath = path.join(workspaceRoot, dataFile);
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, contents);
  return artifactPath;
};

test('lists the complete pinned Rsdoctor tool catalog as sorted unique descriptors', () => {
  const tools = listRsdoctorTools();

  expect(tools.length).toBeGreaterThan(0);
  expect(tools.map((tool) => tool.name)).toEqual([
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
  ]);
  expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);

  for (const tool of tools) {
    expect(tool.inputSchema).toBeTypeOf('object');
    expect(tool.inputSchema).not.toBeNull();
    expect(Array.isArray(tool.inputSchema)).toBe(false);
  }
});

test('rejects an absolute Rsdoctor data file path without exposing the workspace path', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const artifactPath = await writeArtifact(workspaceRoot, validDataFile, '{"data":{}}');
    let error: unknown;

    try {
      await analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: artifactPath,
        toolName: 'build_summary',
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('relative path');
    expect((error as Error).message).not.toContain(workspaceRoot);
  });
});

test('rejects an external Rsdoctor data file path', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: '../rsdoctor-data.json',
        toolName: 'build_summary',
      }),
    ).rejects.toThrow('relative path');
  });
});

test('rejects a Rsdoctor data file symlink that escapes the workspace', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const externalRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-rsdoctor-external-'));

    try {
      const externalArtifact = await writeArtifact(
        externalRoot,
        'rsdoctor-data.json',
        '{"data":{}}',
      );
      const symlinkPath = path.join(workspaceRoot, validDataFile);
      await mkdir(path.dirname(symlinkPath), { recursive: true });
      await symlink(externalArtifact, symlinkPath);

      await expect(
        analyzeRsdoctorArtifact(workspaceRoot, {
          dataFile: validDataFile,
          toolName: 'build_summary',
        }),
      ).rejects.toThrow('within the workspace');
    } finally {
      await rm(externalRoot, { force: true, recursive: true });
    }
  });
});

test('rejects a Rsdoctor data file with an unexpected filename', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const dataFile = 'artifacts/not-rsdoctor-data.json';
    await writeArtifact(workspaceRoot, dataFile, '{"data":{}}');

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, { dataFile, toolName: 'build_summary' }),
    ).rejects.toThrow('rsdoctor-data.json');
  });
});

test('rejects a directory in place of a Rsdoctor data file', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await mkdir(path.join(workspaceRoot, validDataFile), { recursive: true });

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'build_summary',
      }),
    ).rejects.toThrow('regular file');
  });
});

test('rejects malformed Rsdoctor artifact JSON', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeArtifact(workspaceRoot, validDataFile, '{not-json');

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'build_summary',
      }),
    ).rejects.toThrow('valid JSON');
  });
});

test('rejects a Rsdoctor artifact missing its data envelope', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeArtifact(workspaceRoot, validDataFile, '{}');

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'build_summary',
      }),
    ).rejects.toThrow('object data field');
  });
});

test('rejects a Rsdoctor artifact whose data envelope is not an object', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeArtifact(workspaceRoot, validDataFile, '{"data":[]}');

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'build_summary',
      }),
    ).rejects.toThrow('object data field');
  });
});

test('accepts a valid Rsdoctor artifact larger than ten MiB within the approved limit', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeArtifact(
      workspaceRoot,
      validDataFile,
      JSON.stringify({ data: { padding: 'x'.repeat(10 * 1024 * 1024) } }),
    );

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'build_summary',
      }),
    ).resolves.toMatchObject({
      dataFile: validDataFile,
      result: { data: null, ok: true },
      toolName: 'build_summary',
    });
  });
});

test('rejects a Rsdoctor artifact larger than the approved 64 MiB limit before parsing it', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeArtifact(workspaceRoot, validDataFile, 'x'.repeat(64 * 1024 * 1024 + 1));

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'build_summary',
      }),
    ).rejects.toThrow('exceeds the 64 MiB limit');
  });
});

test('rejects an unknown Rsdoctor tool name', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeArtifact(workspaceRoot, validDataFile, '{"data":{}}');

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'not_a_real_tool',
      }),
    ).rejects.toThrow('Unknown Rsdoctor tool');
  });
});

test('runs a real Rsdoctor catalog tool against a valid artifact fixture', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeArtifact(
      workspaceRoot,
      validDataFile,
      JSON.stringify({ data: { summary: { costs: [{ costs: 12 }] } } }),
    );

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'build_summary',
      }),
    ).resolves.toEqual({
      dataFile: validDataFile,
      result: {
        data: { costs: [{ costs: 12 }], totalCost: 12 },
        description: 'Get build summary with costs (build time analysis).',
        ok: true,
      },
      toolName: 'build_summary',
    });
  });
});

test('sanitizes untrusted errors_list output while preserving safe relative diagnostics', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const externalRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-rsdoctor-external-'));
    const secret = 'do-not-return-this';

    try {
      await writeArtifact(
        workspaceRoot,
        validDataFile,
        JSON.stringify({
          data: {
            errors: [
              {
                description: `Compile failed for src/safe.ts at ${workspaceRoot}/private/source.ts and ${externalRoot}/environment; API_TOKEN=${secret}; NODE_ENV=production.`,
                error: {
                  [workspaceRoot]: 'do-not-return-path-key',
                  config: { apiKey: secret },
                  environment: { API_TOKEN: secret, NODE_ENV: 'production' },
                  note: 'safe relative diagnostic',
                  relativeFile: 'src/safe.ts',
                  source: 'function privateSource() {}',
                },
                id: `${workspaceRoot}/private/error.ts`,
              },
            ],
          },
        }),
      );

      const analysis = await analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'errors_list',
      });
      const serialized = JSON.stringify(analysis);

      expect(serialized).toContain('src/safe.ts');
      expect(serialized).toContain('safe relative diagnostic');
      expect(serialized).toContain('<redacted absolute path>');
      expect(serialized).toContain('<redacted secret>');
      expect(serialized).not.toContain(workspaceRoot);
      expect(serialized).not.toContain(externalRoot);
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain('API_TOKEN');
      expect(serialized).not.toContain('NODE_ENV');
      expect(serialized).not.toContain('function privateSource');
    } finally {
      await rm(externalRoot, { force: true, recursive: true });
    }
  });
});

test('sanitizes Windows paths and credential/configuration fields in real errors_list output', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const accessKey = 'windows-access-key';
    const credentialSecret = 'windows-credential-secret';
    const optionSecret = 'windows-option-secret';
    const rootedPath = String.raw`\repo\private.ts`;
    const uncPath = String.raw`\\server\share\repo\private.ts`;

    await writeArtifact(
      workspaceRoot,
      validDataFile,
      JSON.stringify({
        data: {
          errors: [
            {
              description: `Windows failure at ${uncPath} and ${rootedPath}; accessKey=${accessKey}.`,
              error: {
                [rootedPath]: 'rooted path key',
                [uncPath]: 'UNC path key',
                accessKey,
                credentials: { password: credentialSecret },
                options: { define: { PRIVATE_VALUE: optionSecret } },
                relativeFile: 'src/safe-windows.ts',
              },
              id: uncPath,
            },
          ],
        },
      }),
    );

    const analysis = await analyzeRsdoctorArtifact(workspaceRoot, {
      dataFile: validDataFile,
      toolName: 'errors_list',
    });
    const serialized = JSON.stringify(analysis);

    expect(serialized).toContain('src/safe-windows.ts');
    expect(serialized).toContain('<redacted absolute path>');
    expect(serialized).not.toContain(uncPath);
    expect(serialized).not.toContain(rootedPath);
    expect(serialized).not.toContain(accessKey);
    expect(serialized).not.toContain(credentialSecret);
    expect(serialized).not.toContain(optionSecret);
    expect(serialized).not.toContain('accessKey');
    expect(serialized).not.toContain('credentials');
    expect(serialized).not.toContain('options');
  });
});

test('preserves safe sourceSize metadata from a real retained-modules tool result', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeArtifact(
      workspaceRoot,
      validDataFile,
      JSON.stringify({
        data: {
          chunkGraph: { assets: [], chunks: [] },
          moduleGraph: {
            modules: [
              {
                bailoutReason: 'side effect',
                id: 'safe-module',
                path: 'src/safe.ts',
                size: { gzipSize: 24, parsedSize: 48, sourceSize: 96 },
              },
            ],
          },
        },
      }),
    );

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'tree_shaking_retained_modules',
      }),
    ).resolves.toMatchObject({
      result: {
        data: {
          items: [
            {
              path: 'src/safe.ts',
              size: { gzipSize: 24, parsedSize: 48, sourceSize: 96 },
            },
          ],
        },
      },
    });
  });
});

test('rejects a real Rsdoctor tool result exceeding one MiB', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const description = 'x'.repeat(512 * 1024);
    await writeArtifact(
      workspaceRoot,
      validDataFile,
      JSON.stringify({
        data: {
          errors: [
            { description, id: 'first' },
            { description, id: 'second' },
          ],
        },
      }),
    );

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'errors_list',
      }),
    ).rejects.toThrow('filter, page, or pageSize');
  });
});
