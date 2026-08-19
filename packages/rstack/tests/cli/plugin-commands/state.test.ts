import { afterEach, expect, test } from 'rstack/test';
import { setupCommands } from '../../../src/cli/commands.ts';
import { getConfigState } from '../../../src/config.ts';

const state = getConfigState();
const originalArgv = process.argv;

afterEach(() => {
  process.argv = originalArgv;
  delete (globalThis as { RSTACK_VERSION?: string }).RSTACK_VERSION;
  delete state.configPath;
  delete state.invocation;
});

test('clears prior invocation state for config-free root help', async () => {
  state.configPath = '/prior/rstack.config.ts';
  state.invocation = {
    cwd: '/prior',
    command: 'build',
    args: [],
    configFilePath: '/prior/rstack.config.ts',
  };
  process.argv = ['node', 'rs', '--config', './ignored.config.ts', '--help'];
  (globalThis as { RSTACK_VERSION?: string }).RSTACK_VERSION = 'test';

  await setupCommands();

  expect(state).toEqual({});
});
