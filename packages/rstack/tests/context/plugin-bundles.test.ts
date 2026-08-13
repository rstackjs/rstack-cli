import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'rstack/test';

const repositoryRoot = path.resolve(import.meta.dirname, '../../../..');
const repositoryUrl = 'https://github.com/rstackjs/rstack-cli';
const skillNames = [
  'find-unused-code',
  'explain-dead-code',
  'assess-change-impact',
  'analyze-build',
  'debug-dev-cycle',
  'review-context-change',
] as const;

type PluginManifest = {
  name: string;
  version: string;
  repository: string;
  license: string;
  skills: string;
  mcpServers: string;
  interface?: { defaultPrompt: string[] };
};

type CodexMarketplace = {
  plugins: Array<{
    name: string;
    source: { source: string; path: string };
  }>;
};

type ClaudeMarketplace = {
  plugins: Array<{ name: string; source: string }>;
};

type McpConfiguration = {
  mcpServers: { rstack: { command: string; args: string[] } };
};

const readJson = async <T>(relativePath: string): Promise<T> =>
  JSON.parse(await readFile(path.join(repositoryRoot, relativePath), 'utf8')) as T;

const runConfiguredMcpServer = async (
  configuration: McpConfiguration,
  cwd: string,
  recordPath: string,
  options: { pathEntries?: string[]; stdin?: string; exitCode?: number } = {},
): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}> => {
  const { command, args } = configuration.mcpServers.rstack;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        PATH: [...(options.pathEntries ?? []), path.dirname(process.execPath)].join(path.delimiter),
        RSTACK_LAUNCH_RECORD: recordPath,
        RSTACK_LAUNCH_EXIT_CODE: String(options.exitCode ?? 0),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.once('error', reject);
    child.once('close', (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
    child.stdin.end(options.stdin);
  });
};

test('publishes host-valid plugin manifests and MCP launch configurations', async () => {
  const codexManifest = await readJson<PluginManifest>(
    'plugins/rstack-codex/.codex-plugin/plugin.json',
  );
  const claudeManifest = await readJson<PluginManifest>(
    'plugins/rstack-claude/.claude-plugin/plugin.json',
  );

  expect(codexManifest).toMatchObject({
    name: 'rstack-codex',
    version: '0.1.0',
    repository: repositoryUrl,
    license: 'MIT',
    skills: './skills/',
    mcpServers: './.mcp.json',
    interface: {
      defaultPrompt: [
        'Show my current Rstack build, lint, and test context from stored checkout-local evidence; do not run a new capture.',
      ],
    },
  });
  expect(claudeManifest).toMatchObject({
    name: 'rstack-context-claude',
    version: '0.1.0',
    repository: repositoryUrl,
    license: 'MIT',
    skills: './skills/',
    mcpServers: './.mcp.json',
  });

  const [codexMcpSource, claudeMcpSource] = await Promise.all([
    readFile(path.join(repositoryRoot, 'plugins/rstack-codex/.mcp.json'), 'utf8'),
    readFile(path.join(repositoryRoot, 'plugins/rstack-claude/.mcp.json'), 'utf8'),
  ]);
  const codexMcpConfiguration = JSON.parse(codexMcpSource) as McpConfiguration;

  expect(claudeMcpSource).toBe(codexMcpSource);
  expect(codexMcpConfiguration).toEqual({
    mcpServers: {
      rstack: {
        command: 'node',
        args: ['--input-type=module', '--eval', expect.any(String)],
      },
    },
  });

  await Promise.all(
    [
      { pluginRoot: 'plugins/rstack-codex', manifest: codexManifest },
      { pluginRoot: 'plugins/rstack-claude', manifest: claudeManifest },
    ].flatMap(({ pluginRoot, manifest }) =>
      [manifest.skills, manifest.mcpServers].map((componentPath) =>
        access(path.resolve(repositoryRoot, pluginRoot, componentPath)),
      ),
    ),
  );
});

test('launches each MCP configuration through the workspace-local rstack package', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'rstack-plugin-launch-'));
  const packageRoot = path.join(workspace, 'node_modules/rstack');

  try {
    await mkdir(path.join(packageRoot, 'bin'), { recursive: true });
    await writeFile(
      path.join(packageRoot, 'package.json'),
      JSON.stringify({
        name: 'rstack',
        type: 'module',
        exports: { './package.json': './package.json' },
        bin: { rs: './bin/rs.js', rstack: './bin/rs.js' },
      }),
    );
    await writeFile(
      path.join(packageRoot, 'bin/rs.js'),
      [
        "import { writeFile } from 'node:fs/promises';",
        'await writeFile(process.env.RSTACK_LAUNCH_RECORD, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));',
      ].join('\n'),
    );

    for (const [host, configurationPath] of [
      ['codex', 'plugins/rstack-codex/.mcp.json'],
      ['claude', 'plugins/rstack-claude/.mcp.json'],
    ] as const) {
      const recordPath = path.join(workspace, `${host}-launch.json`);
      const configuration = await readJson<McpConfiguration>(configurationPath);

      await expect(runConfiguredMcpServer(configuration, workspace, recordPath)).resolves.toEqual({
        code: 0,
        signal: null,
        stdout: '',
        stderr: '',
      });

      await expect(
        readFile(recordPath, 'utf8').then(
          (contents) => JSON.parse(contents) as { args: string[]; cwd: string },
        ),
      ).resolves.toEqual({ args: ['mcp'], cwd: workspace });
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('falls back to the PATH rs executable with inherited stdio and exit status', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'rstack-plugin-path-launch-'));
  const binPath = path.join(workspace, 'bin');

  try {
    await mkdir(binPath);
    await writeFile(
      path.join(binPath, 'rs'),
      [
        '#!/usr/bin/env node',
        "const { writeFileSync } = require('node:fs');",
        "let stdin = '';",
        "process.stdin.setEncoding('utf8');",
        "process.stdin.on('data', (chunk) => { stdin += chunk; });",
        "process.stdin.on('end', () => {",
        '  writeFileSync(process.env.RSTACK_LAUNCH_RECORD, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), stdin }));',
        "  process.stdout.write('fallback stdout');",
        "  process.stderr.write('fallback stderr');",
        '  process.exitCode = Number(process.env.RSTACK_LAUNCH_EXIT_CODE);',
        '});',
      ].join('\n'),
      { mode: 0o755 },
    );

    for (const [host, configurationPath] of [
      ['codex', 'plugins/rstack-codex/.mcp.json'],
      ['claude', 'plugins/rstack-claude/.mcp.json'],
    ] as const) {
      const recordPath = path.join(workspace, `${host}-path-launch.json`);
      const configuration = await readJson<McpConfiguration>(configurationPath);

      await expect(
        runConfiguredMcpServer(configuration, workspace, recordPath, {
          pathEntries: [binPath],
          stdin: 'fallback stdin',
          exitCode: 23,
        }),
      ).resolves.toEqual({
        code: 23,
        signal: null,
        stdout: 'fallback stdout',
        stderr: 'fallback stderr',
      });
      await expect(
        readFile(recordPath, 'utf8').then(
          (contents) =>
            JSON.parse(contents) as {
              args: string[];
              cwd: string;
              stdin: string;
            },
        ),
      ).resolves.toEqual({
        args: ['mcp'],
        cwd: workspace,
        stdin: 'fallback stdin',
      });
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('reports how to install rstack when no MCP launcher is available', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'rstack-plugin-missing-launch-'));

  try {
    for (const [host, configurationPath] of [
      ['codex', 'plugins/rstack-codex/.mcp.json'],
      ['claude', 'plugins/rstack-claude/.mcp.json'],
    ] as const) {
      const configuration = await readJson<McpConfiguration>(configurationPath);

      await expect(
        runConfiguredMcpServer(configuration, workspace, path.join(workspace, `${host}.json`)),
      ).resolves.toEqual({
        code: 1,
        signal: null,
        stdout: '',
        stderr:
          'Unable to launch Rstack MCP server: install rstack in this workspace or put rs on PATH.\n',
      });
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('registers each bundle in its repository marketplace', async () => {
  const codexMarketplace = await readJson<CodexMarketplace>('.agents/plugins/marketplace.json');
  const claudeMarketplace = await readJson<ClaudeMarketplace>('.claude-plugin/marketplace.json');

  expect(codexMarketplace.plugins).toContainEqual(
    expect.objectContaining({
      name: 'rstack-codex',
      source: { source: 'local', path: './plugins/rstack-codex' },
    }),
  );
  expect(claudeMarketplace.plugins).toContainEqual(
    expect.objectContaining({
      name: 'rstack-context-claude',
      source: './plugins/rstack-claude',
    }),
  );
});

test('ships the same six concise skills for Codex and Claude', async () => {
  for (const skillName of skillNames) {
    const codexSkillPath = path.join(
      repositoryRoot,
      'plugins/rstack-codex/skills',
      skillName,
      'SKILL.md',
    );
    const claudeSkillPath = path.join(
      repositoryRoot,
      'plugins/rstack-claude/skills',
      skillName,
      'SKILL.md',
    );
    const [codexSkill, claudeSkill] = await Promise.all([
      readFile(codexSkillPath, 'utf8'),
      readFile(claudeSkillPath, 'utf8'),
    ]);

    expect(claudeSkill).toBe(codexSkill);
    expect(codexSkill.trimEnd().split('\n').length).toBeLessThan(120);
  }
});

test('routes build health questions beyond the timing summary', async () => {
  const skill = await readFile(
    path.join(repositoryRoot, 'plugins/rstack-codex/skills/analyze-build/SKILL.md'),
    'utf8',
  );

  expect(skill).toContain('`build_summary` is a timing summary');
  expect(skill).toContain('warnings or build health');
  expect(skill).toContain('query `errors_list`');
  expect(skill).toContain('query `bundle_optimize`');
});

test('does not bundle unsupported host components or a second runtime', async () => {
  for (const pluginRoot of ['plugins/rstack-codex', 'plugins/rstack-claude']) {
    const pluginPath = path.join(repositoryRoot, pluginRoot);
    const entries = await readdir(pluginPath);
    const nestedEntries = await readdir(pluginPath, { recursive: true });

    expect(entries.sort()).toEqual([
      pluginRoot.endsWith('codex') ? '.codex-plugin' : '.claude-plugin',
      '.mcp.json',
      'skills',
    ]);
    expect(
      nestedEntries.filter((entry) =>
        /(?:^|\/)(?:agents|apps|hooks|monitors|workflows)(?:\/|$)/u.test(entry),
      ),
    ).toEqual([]);
  }
});
