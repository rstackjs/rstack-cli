import path from 'node:path';
import { afterEach, expect, test } from 'rstack/test';
import {
  applyRstackConfigModifiers,
  getConfigState,
  loadRstackConfig,
} from '../../../src/config.ts';

declare global {
  // rslint-disable-next-line no-var
  var __rstackPluginModifierSetups: number | undefined;
}

const state = getConfigState();
const configFilePath = path.join(import.meta.dirname, 'rstack.config.ts');

afterEach(() => {
  delete state.invocation;
  delete globalThis.__rstackPluginModifierSetups;
  delete globalThis.__rstackPluginModifierContext;
  delete globalThis.__rstackPluginModifierError;
});

test('propagates modifier errors', async () => {
  const loaded = await loadRstackConfig({ configFilePath });
  globalThis.__rstackPluginModifierError = true;

  await expect(applyRstackConfigModifiers(loaded, 'app', {})).rejects.toThrow(
    'plugin modifier error',
  );
});

test('applies typed modifiers to native defaults in registration order', async () => {
  const loaded = await loadRstackConfig({ configFilePath });

  await expect(applyRstackConfigModifiers(loaded, 'app', {})).resolves.toEqual({
    setup: 1,
    root: 'app-1',
  });
  await expect(applyRstackConfigModifiers(loaded, 'lib', {})).resolves.toEqual({
    root: 'lib-1',
  });
  await expect(applyRstackConfigModifiers(loaded, 'doc', {})).resolves.toEqual({
    root: 'doc-1',
  });
  await expect(applyRstackConfigModifiers(loaded, 'test', {})).resolves.toEqual({
    name: 'test-1',
    reporters: ['dot'],
  });
  await expect(applyRstackConfigModifiers(loaded, 'lint', [])).resolves.toEqual([
    { name: 'lint-1' },
  ]);
  await expect(applyRstackConfigModifiers(loaded, 'fmt', {})).resolves.toEqual({
    singleQuote: true,
  });
  await expect(applyRstackConfigModifiers(loaded, 'staged', {})).resolves.toEqual({
    '*.ts': 'echo staged-1',
  });
});

test('initializes plugins again for each fresh config load', async () => {
  state.invocation = {
    cwd: '/invocation',
    command: 'build',
    args: ['--watch'],
    configFilePath: null,
  };

  const first = await loadRstackConfig({ configFilePath });
  const second = await loadRstackConfig({ configFilePath });

  await expect(applyRstackConfigModifiers(first, 'app', {})).resolves.toMatchObject({
    root: 'app-1',
  });
  await expect(applyRstackConfigModifiers(second, 'app', {})).resolves.toMatchObject({
    root: 'app-2',
  });
  expect(globalThis.__rstackPluginModifierContext).toEqual({
    cwd: '/invocation',
    command: 'build',
    args: ['--watch'],
    configFilePath,
  });
});

test('uses the programmatic config cwd in plugin context', async () => {
  const loaded = await loadRstackConfig({
    configFilePath,
    cwd: import.meta.dirname,
  });

  await applyRstackConfigModifiers(loaded, 'app', {});

  expect(globalThis.__rstackPluginModifierContext).toEqual({
    cwd: import.meta.dirname,
    command: 'programmatic',
    args: [],
    configFilePath,
  });
});
