// cspell:ignore artifactbinding contextid nextcursor
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from 'rstack/test';

const repositoryRoot = path.resolve(import.meta.dirname, '../../../..');
const skillNames = [
  'find-unused-code',
  'explain-dead-code',
  'assess-change-impact',
  'analyze-build',
  'debug-dev-cycle',
  'review-context-change',
] as const;

const readSkill = (host: 'rstack-codex' | 'rstack-claude', skill: string) =>
  readFile(path.join(repositoryRoot, 'plugins', host, 'skills', skill, 'SKILL.md'), 'utf8');

const normalized = (source: string) => source.replaceAll(/\s+/g, ' ').toLowerCase();

test('keeps the six Codex and Claude recovery workflows byte-identical', async () => {
  for (const skillName of skillNames) {
    await expect(readSkill('rstack-claude', skillName)).resolves.toBe(
      await readSkill('rstack-codex', skillName),
    );
  }
});

test('binds build analysis to the matching artifact and marks omitted sections unavailable', async () => {
  const skill = normalized(await readSkill('rstack-codex', 'analyze-build'));

  expect(skill).toContain('call `product_roots` with the same `contextid` and `datafile`');
  expect(skill).toContain('exact `artifactbinding`');
  expect(skill).toContain('matching build context exists');
  expect(skill).toContain('omitted rsdoctor sections as unavailable');
});

test('routes local symbols away from artifact-module graph selectors', async () => {
  for (const skillName of [
    'find-unused-code',
    'explain-dead-code',
    'assess-change-impact',
  ] as const) {
    const skill = normalized(await readSkill('rstack-codex', skillName));

    expect(skill).toContain('local symbol');
    expect(skill).toContain('artifact module selector');
    expect(skill).toContain('source-level lint, typescript, or static analysis');
  }
});

test('gives the exact consent-gated capture command for a missing build artifact', async () => {
  for (const skillName of [
    'find-unused-code',
    'explain-dead-code',
    'assess-change-impact',
    'analyze-build',
  ] as const) {
    const skill = normalized(await readSkill('rstack-codex', skillName));

    expect(skill).toContain('rstack_context=1 rsdoctor=true rsdoctor_output=json rs build');
    expect(skill).toContain('rstack_context=1 rsdoctor=true rsdoctor_output=json rs lib');
    expect(skill).toContain('ask before running');
  }
});

test('reports debug evidence freshness and completeness as separate axes', async () => {
  const pluginSkill = await readSkill('rstack-codex', 'debug-dev-cycle');
  const normalizedPluginSkill = normalized(pluginSkill);
  const repositorySkill = await readFile(
    path.join(repositoryRoot, '.agents/skills/debug-dev-cycle/SKILL.md'),
    'utf8',
  );

  expect(normalizedPluginSkill).toContain('freshness as `fresh`, `stale`, `partial`, or `unknown`');
  expect(normalizedPluginSkill).toContain('completeness separately as `complete` or `partial`');
  expect(repositorySkill).toBe(pluginSkill);
});

test('continues unused candidates through every returned page', async () => {
  const skill = normalized(await readSkill('rstack-codex', 'find-unused-code'));

  expect(skill).toContain('while `nextcursor` is returned');
  expect(skill).toContain('same `contextid`, `datafile`, and `limit`');
});

test('recovers a context review through compatible completed snapshots', async () => {
  const pluginSkill = await readSkill('rstack-codex', 'review-context-change');
  const normalizedPluginSkill = normalized(pluginSkill);
  const repositorySkill = await readFile(
    path.join(repositoryRoot, '.agents/skills/review-context-change/SKILL.md'),
    'utf8',
  );

  expect(normalizedPluginSkill).toContain('1. call `project_status` first');
  expect(normalizedPluginSkill).toContain('two compatible completed snapshots');
  expect(normalizedPluginSkill).toContain('no compatible pair exists');
  expect(normalizedPluginSkill).toContain('`lint_snapshot`');
  expect(normalizedPluginSkill).toContain('`test_snapshot`');
  expect(normalizedPluginSkill).toContain('ask before running');
  expect(repositorySkill).toBe(pluginSkill);
});
