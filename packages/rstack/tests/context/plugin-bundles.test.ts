import { access, readFile, readdir } from 'node:fs/promises';
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

const readJson = async <T>(relativePath: string): Promise<T> =>
  JSON.parse(await readFile(path.join(repositoryRoot, relativePath), 'utf8')) as T;

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

  await expect(readJson('plugins/rstack-codex/.mcp.json')).resolves.toEqual({
    mcpServers: { rstack: { command: 'rs', args: ['mcp'] } },
  });
  await expect(readJson('plugins/rstack-claude/.mcp.json')).resolves.toEqual({
    mcpServers: { rstack: { command: 'rs', args: ['mcp'] } },
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
