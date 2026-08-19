import path from 'node:path';
import { test } from '#test-helpers';

for (const configArg of [
  '--config ./rstack.config.ts',
  '--config=./rstack.config.ts',
  '-c ./rstack.config.ts',
  '-c./rstack.config.ts',
]) {
  test(`dispatches a plugin command after removing ${configArg} from its raw arguments`, ({
    cwd,
    execCli,
    expect,
  }) => {
    const output = execCli(`plugin-command first ${configArg} second`);

    expect(JSON.parse(output)).toEqual({
      args: ['first', 'second'],
      context: {
        cwd,
        command: 'plugin-command',
        args: ['first', 'second'],
        configFilePath: path.join(cwd, 'rstack.config.ts'),
      },
    });
  });
}

test('awaits asynchronous plugin command handlers', ({ execCli, expect }) => {
  expect(execCli('async-command')).toBe('async handler completed\n');
});

test('preserves plugin command failures', ({ execCli, expect }) => {
  try {
    execCli('throws-command');
  } catch (error) {
    expect((error as { stderr?: Buffer }).stderr?.toString()).toContain(
      'plugin command failure',
    );
    return;
  }

  throw new Error('Expected the plugin command to fail.');
});

test('keeps root help and version config-free', ({ execCli, expect }) => {
  expect(execCli('--config ./broken.config.ts --help')).toContain('$ rs');
  expect(execCli('-c./broken.config.ts --version')).toMatch(/^Rstack v/u);
});
