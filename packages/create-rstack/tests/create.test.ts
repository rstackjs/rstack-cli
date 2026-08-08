import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, test } from 'rstack/test';

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, '..');
const binPath = path.join(packageRoot, 'bin.js');
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const createProject = async (template: string) => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'create-rstack-'));
  const projectDirectory = path.join(tempDirectory, 'my-app');
  tempDirectories.push(tempDirectory);

  await execFileAsync(process.execPath, [binPath, projectDirectory, '--template', template], {
    cwd: tempDirectory,
    env: {
      ...process.env,
      npm_config_user_agent: 'pnpm/11.20.0',
    },
  });

  return projectDirectory;
};

test.each([
  {
    template: 'app-vanilla-js',
    configExtension: 'js',
    sourceExtension: 'js',
    hasTypeScript: false,
  },
  {
    template: 'app-vanilla-ts',
    configExtension: 'ts',
    sourceExtension: 'ts',
    hasTypeScript: true,
  },
  {
    template: 'app-react-js',
    configExtension: 'js',
    sourceExtension: 'jsx',
    hasTypeScript: false,
  },
  {
    template: 'app-react-ts',
    configExtension: 'ts',
    sourceExtension: 'tsx',
    hasTypeScript: true,
  },
  {
    template: 'app-vue-js',
    configExtension: 'js',
    sourceExtension: 'js',
    hasTypeScript: false,
  },
  {
    template: 'app-vue-ts',
    configExtension: 'ts',
    sourceExtension: 'ts',
    hasTypeScript: true,
  },
  {
    template: 'app-solid-js',
    configExtension: 'js',
    sourceExtension: 'jsx',
    hasTypeScript: false,
  },
  {
    template: 'app-solid-ts',
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

    await expect(access(path.join(projectDirectory, 'README.md'))).resolves.toBeUndefined();
    await expect(access(path.join(projectDirectory, '.gitignore'))).resolves.toBeUndefined();
    await expect(
      access(path.join(projectDirectory, `rstack.config.${configExtension}`)),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(projectDirectory, `src/index.${sourceExtension}`)),
    ).resolves.toBeUndefined();

    const tsconfigPath = path.join(projectDirectory, 'tsconfig.json');
    if (hasTypeScript) {
      await expect(access(tsconfigPath)).resolves.toBeUndefined();
    } else {
      await expect(access(tsconfigPath)).rejects.toThrow();
    }
  },
);

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
