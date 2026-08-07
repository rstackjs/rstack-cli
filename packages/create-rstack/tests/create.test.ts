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
  { template: 'app-js', extension: 'js', hasTypeScript: false },
  { template: 'app-ts', extension: 'ts', hasTypeScript: true },
])('creates the $template template', async ({ template, extension, hasTypeScript }) => {
  const projectDirectory = await createProject(template);
  const packageJson = JSON.parse(
    await readFile(path.join(projectDirectory, 'package.json'), 'utf8'),
  );

  expect(packageJson).toMatchObject({
    name: 'my-app',
    private: true,
    scripts: {
      build: 'rs build',
      dev: 'rs dev --open',
      preview: 'rs preview',
    },
    devDependencies: {
      rstack: '^0.3.5',
    },
  });

  await expect(access(path.join(projectDirectory, 'README.md'))).resolves.toBeUndefined();
  await expect(access(path.join(projectDirectory, '.gitignore'))).resolves.toBeUndefined();
  await expect(
    access(path.join(projectDirectory, `rstack.config.${extension}`)),
  ).resolves.toBeUndefined();
  await expect(
    access(path.join(projectDirectory, `src/index.${extension}`)),
  ).resolves.toBeUndefined();

  const tsconfigPath = path.join(projectDirectory, 'tsconfig.json');
  if (hasTypeScript) {
    await expect(access(tsconfigPath)).resolves.toBeUndefined();
    expect(packageJson.devDependencies).toMatchObject({
      '@types/node': '^24.13.3',
      typescript: '^7.0.2',
    });
  } else {
    await expect(access(tsconfigPath)).rejects.toThrow();
  }
});

test.each([
  { template: 'lib-js', extension: 'js', hasTypeScript: false },
  { template: 'lib-ts', extension: 'ts', hasTypeScript: true },
])('creates the $template template', async ({ template, extension, hasTypeScript }) => {
  const projectDirectory = await createProject(template);
  const packageJson = JSON.parse(
    await readFile(path.join(projectDirectory, 'package.json'), 'utf8'),
  );

  expect(packageJson.name).toBe('my-app');

  await expect(
    access(path.join(projectDirectory, `rstack.config.${extension}`)),
  ).resolves.toBeUndefined();
  await expect(
    access(path.join(projectDirectory, `src/index.${extension}`)),
  ).resolves.toBeUndefined();
  await expect(
    access(path.join(projectDirectory, `tests/index.test.${extension}`)),
  ).resolves.toBeUndefined();

  const tsconfigPath = path.join(projectDirectory, 'tsconfig.json');
  if (hasTypeScript) {
    await expect(access(tsconfigPath)).resolves.toBeUndefined();
  } else {
    await expect(access(tsconfigPath)).rejects.toThrow();
  }
});
