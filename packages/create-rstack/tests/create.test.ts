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
const jsCheckScript = 'rs lint && rs fmt --check';
const tsCheckScript = 'rs lint --type-check && rs fmt --check';
const templatesWithoutTypeCheck = new Set([
  'app-svelte-ts',
  'app-vue-ts',
  'lib-svelte-ts',
  'lib-vue-ts',
]);

const getCheckScript = (template: string, hasTypeScript: boolean): string =>
  hasTypeScript && !templatesWithoutTypeCheck.has(template) ? tsCheckScript : jsCheckScript;

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
  const packageJson = JSON.parse(
    await readFile(path.join(projectDirectory, 'package.json'), 'utf8'),
  );

  await expectNoStagedSetup(projectDirectory, 'ts', packageJson.scripts);
});

test.each([
  {
    template: 'app-vanilla-js',
    configExtension: 'js',
    sourceExtension: 'js',
    testFile: 'dom.test.js',
    hasTypeScript: false,
  },
  {
    template: 'app-vanilla-ts',
    configExtension: 'ts',
    sourceExtension: 'ts',
    testFile: 'dom.test.ts',
    hasTypeScript: true,
  },
  {
    template: 'app-react-js',
    configExtension: 'js',
    sourceExtension: 'jsx',
    testFile: 'index.test.jsx',
    hasTypeScript: false,
  },
  {
    template: 'app-react-ts',
    configExtension: 'ts',
    sourceExtension: 'tsx',
    testFile: 'index.test.tsx',
    hasTypeScript: true,
  },
  {
    template: 'app-preact-js',
    configExtension: 'js',
    sourceExtension: 'jsx',
    testFile: 'index.test.jsx',
    hasTypeScript: false,
  },
  {
    template: 'app-preact-ts',
    configExtension: 'ts',
    sourceExtension: 'tsx',
    testFile: 'index.test.tsx',
    hasTypeScript: true,
  },
  {
    template: 'app-vue-js',
    configExtension: 'js',
    sourceExtension: 'js',
    testFile: 'index.test.js',
    hasTypeScript: false,
  },
  {
    template: 'app-vue-ts',
    configExtension: 'ts',
    sourceExtension: 'ts',
    testFile: 'index.test.ts',
    hasTypeScript: true,
  },
  {
    template: 'app-lit-js',
    configExtension: 'js',
    sourceExtension: 'js',
    testFile: 'index.test.js',
    hasTypeScript: false,
  },
  {
    template: 'app-lit-ts',
    configExtension: 'ts',
    sourceExtension: 'ts',
    testFile: 'index.test.ts',
    hasTypeScript: true,
  },
  {
    template: 'app-svelte-js',
    configExtension: 'js',
    sourceExtension: 'js',
    testFile: 'index.test.js',
    hasTypeScript: false,
  },
  {
    template: 'app-svelte-ts',
    configExtension: 'ts',
    sourceExtension: 'ts',
    testFile: 'index.test.ts',
    hasTypeScript: true,
  },
  {
    template: 'app-solid-js',
    configExtension: 'js',
    sourceExtension: 'jsx',
    testFile: 'index.test.jsx',
    hasTypeScript: false,
  },
  {
    template: 'app-solid-ts',
    configExtension: 'ts',
    sourceExtension: 'tsx',
    testFile: 'index.test.tsx',
    hasTypeScript: true,
  },
])(
  'creates the $template template',
  async ({ template, configExtension, sourceExtension, testFile, hasTypeScript }) => {
    const projectDirectory = await createProject(template);
    const packageJson = JSON.parse(
      await readFile(path.join(projectDirectory, 'package.json'), 'utf8'),
    );

    expect(packageJson.name).toBe('my-app');
    expect(packageJson.scripts.check).toBe(getCheckScript(template, hasTypeScript));
    await expectStagedSetup(projectDirectory, configExtension, packageJson.scripts);

    await expect(access(path.join(projectDirectory, 'README.md'))).resolves.toBeUndefined();
    await expect(access(path.join(projectDirectory, '.gitignore'))).resolves.toBeUndefined();
    await expect(
      access(path.join(projectDirectory, `rstack.config.${configExtension}`)),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(projectDirectory, `src/index.${sourceExtension}`)),
    ).resolves.toBeUndefined();
    await expect(access(path.join(projectDirectory, 'tests', testFile))).resolves.toBeUndefined();

    const tsconfigPath = path.join(projectDirectory, 'tsconfig.json');
    if (hasTypeScript) {
      await expect(access(tsconfigPath)).resolves.toBeUndefined();
    } else {
      await expect(access(tsconfigPath)).rejects.toThrow();
    }
  },
);

test('creates the doc-basic template', async () => {
  const projectDirectory = await createProject('doc-basic');
  const packageJson = JSON.parse(
    await readFile(path.join(projectDirectory, 'package.json'), 'utf8'),
  );

  expect(packageJson.name).toBe('my-app');
  expect(packageJson.scripts.check).toBe(tsCheckScript);
  await expectStagedSetup(projectDirectory, 'ts', packageJson.scripts);

  await expect(access(path.join(projectDirectory, 'README.md'))).resolves.toBeUndefined();
  await expect(access(path.join(projectDirectory, '.gitignore'))).resolves.toBeUndefined();
  await expect(access(path.join(projectDirectory, 'rstack.config.ts'))).resolves.toBeUndefined();
  await expect(access(path.join(projectDirectory, 'tsconfig.json'))).resolves.toBeUndefined();
  await expect(access(path.join(projectDirectory, 'docs', 'index.md'))).resolves.toBeUndefined();
  await expect(
    access(path.join(projectDirectory, 'docs', 'guide', 'start', 'introduction.md')),
  ).resolves.toBeUndefined();
});

test('creates the doc-i18n template', async () => {
  const projectDirectory = await createProject('doc-i18n');
  const packageJson = JSON.parse(
    await readFile(path.join(projectDirectory, 'package.json'), 'utf8'),
  );

  expect(packageJson.name).toBe('my-app');
  expect(packageJson.scripts.check).toBe(tsCheckScript);
  await expectStagedSetup(projectDirectory, 'ts', packageJson.scripts);

  await expect(access(path.join(projectDirectory, 'rstack.config.ts'))).resolves.toBeUndefined();
  await expect(
    access(path.join(projectDirectory, 'docs', 'en', 'index.md')),
  ).resolves.toBeUndefined();
  await expect(
    access(path.join(projectDirectory, 'docs', 'zh', 'index.md')),
  ).resolves.toBeUndefined();
});

test.each([
  {
    template: 'lib-node-js',
    configExtension: 'js',
    sourceExtension: 'js',
    hasTypeScript: false,
  },
  {
    template: 'lib-node-ts',
    configExtension: 'ts',
    sourceExtension: 'ts',
    hasTypeScript: true,
  },
  {
    template: 'lib-react-js',
    configExtension: 'js',
    sourceExtension: 'jsx',
    hasTypeScript: false,
  },
  {
    template: 'lib-react-ts',
    configExtension: 'ts',
    sourceExtension: 'tsx',
    hasTypeScript: true,
  },
  {
    template: 'lib-vue-js',
    configExtension: 'js',
    sourceExtension: 'js',
    hasTypeScript: false,
  },
  {
    template: 'lib-vue-ts',
    configExtension: 'ts',
    sourceExtension: 'ts',
    hasTypeScript: true,
  },
  {
    template: 'lib-svelte-js',
    configExtension: 'js',
    sourceExtension: 'js',
    hasTypeScript: false,
  },
  {
    template: 'lib-svelte-ts',
    configExtension: 'ts',
    sourceExtension: 'ts',
    hasTypeScript: true,
  },
  {
    template: 'lib-solid-js',
    configExtension: 'js',
    sourceExtension: 'jsx',
    hasTypeScript: false,
  },
  {
    template: 'lib-solid-ts',
    configExtension: 'ts',
    sourceExtension: 'tsx',
    hasTypeScript: true,
  },
])(
  'creates the $template template',
  async ({ template, configExtension, sourceExtension, hasTypeScript }) => {
    const projectDirectory = await createProject(template);
    const packageJson = JSON.parse(
      await readFile(path.join(projectDirectory, 'package.json'), 'utf8'),
    );

    expect(packageJson.name).toBe('my-app');
    expect(packageJson.scripts.check).toBe(getCheckScript(template, hasTypeScript));
    await expectStagedSetup(projectDirectory, configExtension, packageJson.scripts);

    await expect(
      access(path.join(projectDirectory, `rstack.config.${configExtension}`)),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(projectDirectory, `src/index.${sourceExtension}`)),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(projectDirectory, `tests/index.test.${sourceExtension}`)),
    ).resolves.toBeUndefined();

    const tsconfigPath = path.join(projectDirectory, 'tsconfig.json');
    if (hasTypeScript) {
      await expect(access(tsconfigPath)).resolves.toBeUndefined();
    } else {
      await expect(access(tsconfigPath)).rejects.toThrow();
    }
  },
);
