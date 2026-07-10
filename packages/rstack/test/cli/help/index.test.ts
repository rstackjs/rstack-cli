import { test } from '#test-helpers';

test('should display the colorized help message', ({ execCli, expect }) => {
  const output = execCli('--help', {
    env: {
      FORCE_COLOR: '1',
    },
  });

  expect(output).toContain('\x1b[36mUsage\x1b[39m:');
  expect(output).toContain('\x1b[33m  $ rs [command] [...options]\x1b[39m');
  expect(output).toContain('\x1b[36mCommands\x1b[39m:');
  expect(output).toContain(
    '\x1b[2mFor command-specific options, run:\n  $ rs <command> -h\x1b[22m',
  );
  expect(output).toContain('\x1b[36mOptions\x1b[39m:');
});
