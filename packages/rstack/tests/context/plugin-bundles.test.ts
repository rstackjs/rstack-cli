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

const mcpLauncher = [
  "import { createRequire } from 'node:module';",
  "import { dirname, join, resolve } from 'node:path';",
  "import { pathToFileURL } from 'node:url';",
  "const require = createRequire(join(process.cwd(), 'package.json'));",
  "const packageJsonPath = require.resolve('rstack/package.json');",
  'const { bin } = require(packageJsonPath);',
  "const binPath = typeof bin === 'string' ? bin : (bin.rs ?? bin.rstack);",
  "if (!binPath) throw new Error('The workspace-local rstack package does not declare an rs binary.');",
  'const cliPath = resolve(dirname(packageJsonPath), binPath);',
  "process.argv = [process.execPath, cliPath, 'mcp'];",
  'await import(pathToFileURL(cliPath).href);',
].join(' ');

const expectedMcpConfiguration: McpConfiguration = {
  mcpServers: {
    rstack: {
      command: 'node',
      args: ['--input-type=module', '--eval', mcpLauncher],
    },
  },
};

const readJson = async <T>(relativePath: string): Promise<T> =>
  JSON.parse(await readFile(path.join(repositoryRoot, relativePath), 'utf8')) as T;

const runConfiguredMcpServer = async (
  configuration: McpConfiguration,
  cwd: string,
  recordPath: string,
): Promise<void> => {
  const { command, args } = configuration.mcpServers.rstack;

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        PATH: path.dirname(process.execPath),
        RSTACK_LAUNCH_RECORD: recordPath,
      },
      stdio: 'ignore',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`MCP launcher exited with code ${code} and signal ${signal}`));
      }
    });
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
      defaultPrompt: ['Analyze my Rstack project using the available checkout-local evidence.'],
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

  await expect(readJson('plugins/rstack-codex/.mcp.json')).resolves.toEqual(
    expectedMcpConfiguration,
  );
  await expect(readJson('plugins/rstack-claude/.mcp.json')).resolves.toEqual(
    expectedMcpConfiguration,
  );

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

      await runConfiguredMcpServer(configuration, workspace, recordPath);

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
