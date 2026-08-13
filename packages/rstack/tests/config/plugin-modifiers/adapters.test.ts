import path from 'node:path';
import { afterEach, expect, test } from 'rstack/test';
import { getConfigState } from '../../../src/config.ts';
import loadRsbuildConfig from '../../../src/rsbuildConfig.ts';
import loadRslibConfig from '../../../src/rslibConfig.ts';
import loadRspressConfig from '../../../src/rspressConfig.ts';
import loadRstestConfig from '../../../src/rstestConfig.ts';

declare global {
  // rslint-disable-next-line no-var
  var __rstackPluginModifierSetups: number | undefined;
}

const state = getConfigState();
const loadAppConfig = loadRsbuildConfig as (params: never) => Promise<unknown>;
const loadLibConfig = loadRslibConfig as (params: never) => Promise<unknown>;
const loadTestConfig = loadRstestConfig as (params: never) => Promise<unknown>;
const configPath = path.join(import.meta.dirname, 'rstack.config.ts');
const factoryOrderConfigPath = path.join(import.meta.dirname, 'factory-order-rstack.config.ts');
const explicitConfigPath = path.join(import.meta.dirname, 'explicit-rstack.config.ts');
const projectsExplicitConfigPath = path.join(
  import.meta.dirname,
  'projects-explicit-rstack.config.ts',
);
const testModifierExtendsConfigPath = path.join(
  import.meta.dirname,
  'test-modifier-extends-rstack.config.ts',
);

afterEach(() => {
  delete state.configPath;
  delete globalThis.__rstackPluginModifierSetups;
  delete globalThis.__rstackExplicitAppModifierCalls;
  delete globalThis.__rstackAllProjectsExplicitAppModifierCalls;
  delete globalThis.__rstackTestModifierExtendsAppCalls;
});

test('constructs automatic Rstest extends before applying test modifiers', async () => {
  state.configPath = testModifierExtendsConfigPath;

  await expect(loadTestConfig({} as never)).resolves.toMatchObject({
    extends: { root: 'test-modifier' },
  });
  expect(globalThis.__rstackTestModifierExtendsAppCalls).toBe(1);
});

test.each([
  ['app', () => loadAppConfig({} as never)],
  ['lib', () => loadLibConfig({} as never)],
  ['doc', () => loadRspressConfig()],
  ['test', () => loadTestConfig({} as never)],
])('initializes plugins before resolving the %s config factory', async (_kind, loadConfig) => {
  state.configPath = factoryOrderConfigPath;

  await expect(loadConfig()).resolves.toBeDefined();
});

test('does not apply app modifiers when all Rstest projects explicitly extend configs', async () => {
  state.configPath = projectsExplicitConfigPath;

  await expect(loadTestConfig({} as never)).resolves.toMatchObject({
    reporters: ['dot'],
    projects: [{ name: 'explicit', extends: {} }],
  });
  expect(globalThis.__rstackAllProjectsExplicitAppModifierCalls).toBeUndefined();
});

test('does not apply app modifiers for explicit Rstest extends', async () => {
  state.configPath = explicitConfigPath;

  await expect(loadTestConfig({} as never)).resolves.toMatchObject({
    extends: {},
    reporters: ['dot'],
  });
  expect(globalThis.__rstackExplicitAppModifierCalls).toBeUndefined();
});

test('uses app, lib, and doc modifiers when their user configs are absent', async () => {
  state.configPath = configPath;

  await expect(loadAppConfig({} as never)).resolves.toMatchObject({ root: 'app-1' });
  await expect(loadLibConfig({} as never)).resolves.toMatchObject({ root: 'lib-2' });
  await expect(loadRspressConfig()).resolves.toMatchObject({ root: 'doc-3' });
});

test('uses plugin-provided app config for automatic Rstest extends and keeps test config native', async () => {
  state.configPath = configPath;

  await expect(loadTestConfig({} as never)).resolves.toMatchObject({
    name: 'test-1',
    reporters: ['dot'],
    extends: expect.anything(),
  });
});
