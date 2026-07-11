import path from 'node:path';
import { expect, test } from 'rstack/test';
import { getConfigState, loadRstackConfig } from '../../../src/config.ts';

test('should reset config state before and after loading', async () => {
  const state = getConfigState();
  state.configs = { app: {} };
  state.configPath = path.join(import.meta.dirname, 'rstack.config.ts');

  try {
    await expect(loadRstackConfig()).rejects.toThrow('test config error');
    expect(state.configs).toEqual({});
  } finally {
    state.configs = {};
    delete state.configPath;
  }
});
