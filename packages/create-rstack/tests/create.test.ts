import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, test } from 'rstack/test';

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, '..');
const binPath = path.join(packageRoot, 'bin.js');
const tempDirectories: string[] = [];
const checkScript = 'rs check';
const typeCheckScript = 'rs check --type-check';
const templatesWithoutTypeCheck = new Set([
  'app-svelte-ts',
  'app-vue-ts',
  'lib-svelte-ts',
  'lib-vue-ts',
]);

type ProjectPackage = {
  name: string;
  scripts: Record<string, string>;
};

type SourceTemplate = {
  template: string;
  sourceExtension: string;
  testFile: string;
};

const sourceTemplates: SourceTemplate[] = [
  { template: 'app-vanilla', sourceExtension: 'js', testFile: 'dom.test.js' },
  { template: 'app-vanilla-ts', sourceExtension: 'ts', testFile: 'dom.test.ts' },
  { template: 'app-react', sourceExtension: 'jsx', testFile: 'index.test.jsx' },
  { template: 'app-react-ts', sourceExtension: 'tsx', testFile: 'index.test.tsx' },
  { template: 'app-preact', sourceExtension: 'jsx', testFile: 'index.test.jsx' },
  { template: 'app-preact-ts', sourceExtension: 'tsx', testFile: 'index.test.tsx' },
  { template: 'app-vue', sourceExtension: 'js', testFile: 'index.test.js' },
  { template: 'app-vue-ts', sourceExtension: 'ts', testFile: 'index.test.ts' },
  { template: 'app-lit', sourceExtension: 'js', testFile: 'index.test.js' },
  { template: 'app-lit-ts', sourceExtension: 'ts', testFile: 'index.test.ts' },
  { template: 'app-svelte', sourceExtension: 'js', testFile: 'index.test.js' },
  { template: 'app-svelte-ts', sourceExtension: 'ts', testFile: 'index.test.ts' },
  { template: 'app-solid', sourceExtension: 'jsx', testFile: 'index.test.jsx' },
  { template: 'app-solid-ts', sourceExtension: 'tsx', testFile: 'index.test.tsx' },
  { template: 'lib-node', sourceExtension: 'js', testFile: 'index.test.js' },
  { template: 'lib-node-ts', sourceExtension: 'ts', testFile: 'index.test.ts' },
  { template: 'lib-react', sourceExtension: 'jsx', testFile: 'index.test.jsx' },
  { template: 'lib-react-ts', sourceExtension: 'tsx', testFile: 'index.test.tsx' },
  { template: 'lib-vue', sourceExtension: 'js', testFile: 'index.test.js' },
  { template: 'lib-vue-ts', sourceExtension: 'ts', testFile: 'index.test.ts' },
  { template: 'lib-svelte', sourceExtension: 'js', testFile: 'index.test.js' },
  { template: 'lib-svelte-ts', sourceExtension: 'ts', testFile: 'index.test.ts' },
  { template: 'lib-solid', sourceExtension: 'jsx', testFile: 'index.test.jsx' },
  { template: 'lib-solid-ts', sourceExtension: 'tsx', testFile: 'index.test.tsx' },
];

const docTemplates = [
  {
    template: 'doc',
    files: [
      'README.md',
      '.gitignore',
      'rstack.config.ts',
      'docs/index.md',
      'docs/guide/start/introduction.md',
    ],
  },
  {
    template: 'doc-i18n',
    files: ['rstack.config.ts', 'docs/en/index.md', 'docs/zh/index.md'],
  },
];

const getCheckScript = (template: string, hasTypeScript: boolean): string =>
  hasTypeScript && !templatesWithoutTypeCheck.has(template) ? typeCheckScript : checkScript;

const readProjectPackage = async (projectDirectory: string): Promise<ProjectPackage> =>
  JSON.parse(await readFile(path.join(projectDirectory, 'package.json'), 'utf8')) as ProjectPackage;

const expectFiles = async (projectDirectory: string, files: string[]): Promise<void> => {
  for (const file of files) {
    await expect(access(path.join(projectDirectory, file))).resolves.toBeUndefined();
  }
};

const expectStagedSetup = async (
  projectDirectory: string,
  configExtension: string,
  scripts: Record<string, string>,
): Promise<void> => {
  expect(scripts.prepare).toBe('rs setup');
  expect(
    await readFile(path.join(projectDirectory, '.rstack', 'hooks', 'pre-commit'), 'utf8'),
  ).toBe('rs staged\n');
  expect(
    await readFile(path.join(projectDirectory, `rstack.config.${configExtension}`), 'utf8'),
  ).toContain('define.staged({');
};

const expectNoStagedSetup = async (
  projectDirectory: string,
  configExtension: string,
  scripts: Record<string, string>,
): Promise<void> => {
  expect(scripts.prepare).toBeUndefined();
  await expect(
    access(path.join(projectDirectory, '.rstack', 'hooks', 'pre-commit')),
  ).rejects.toThrow();
  expect(
    await readFile(path.join(projectDirectory, `rstack.config.${configExtension}`), 'utf8'),
  ).not.toContain('define.staged({');
};

const expectProjectSetup = async (
  projectDirectory: string,
  template: string,
  configExtension: string,
  hasTypeScript: boolean,
): Promise<void> => {
  const packageJson = await readProjectPackage(projectDirectory);

  expect(packageJson.name).toBe('my-app');
  expect(packageJson.scripts.check).toBe(getCheckScript(template, hasTypeScript));
  await expectStagedSetup(projectDirectory, configExtension, packageJson.scripts);

  const tsconfig = access(path.join(projectDirectory, 'tsconfig.json'));
  if (hasTypeScript) {
    await expect(tsconfig).resolves.toBeUndefined();
  } else {
    await expect(tsconfig).rejects.toThrow();
  }
};

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const createProject = async (
  template: string,
  {
    args = [],
    initializeGitIn,
  }: {
    args?: string[];
    initializeGitIn?: 'parent' | 'project';
  } = {},
) => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'create-rstack-'));
  const projectDirectory = path.join(tempDirectory, 'my-app');
  tempDirectories.push(tempDirectory);

  if (initializeGitIn) {
    const gitDirectory = initializeGitIn === 'project' ? projectDirectory : tempDirectory;
    await mkdir(gitDirectory, { recursive: true });
    await execFileAsync('git', ['init', '--quiet'], { cwd: gitDirectory });
  }

  await execFileAsync(
    process.execPath,
    [binPath, projectDirectory, '--template', template, ...args],
    {
      cwd: tempDirectory,
      env: {
        ...process.env,
        npm_config_user_agent: 'pnpm/11.20.0',
      },
    },
  );

  return projectDirectory;
};

test.each([
  {
    scenario: 'Git initialization is disabled',
    options: { args: ['--no-git'], initializeGitIn: 'project' as const },
  },
  {
    scenario: 'the project is inside an existing Git repository',
    options: { initializeGitIn: 'parent' as const },
  },
])('omits staged setup when $scenario', async ({ options }) => {
  const projectDirectory = await createProject('app-vanilla-ts', options);
  const packageJson = await readProjectPackage(projectDirectory);

  await expectNoStagedSetup(projectDirectory, 'ts', packageJson.scripts);
});

test.each(sourceTemplates)(
  'creates the $template template',
  async ({ template, sourceExtension, testFile }) => {
    const hasTypeScript = template.endsWith('-ts');
    const configExtension = hasTypeScript ? 'ts' : 'js';
    const projectDirectory = await createProject(template);
    const files = [
      `rstack.config.${configExtension}`,
      `src/index.${sourceExtension}`,
      `tests/${testFile}`,
    ];

    if (template.startsWith('app-')) {
      files.push('README.md', '.gitignore');
    }

    await expectProjectSetup(projectDirectory, template, configExtension, hasTypeScript);
    await expectFiles(projectDirectory, files);
  },
);

test.each(docTemplates)('creates the $template template', async ({ template, files }) => {
  const projectDirectory = await createProject(template);

  await expectProjectSetup(projectDirectory, template, 'ts', true);
  await expectFiles(projectDirectory, files);
});
