import { test } from '#test-helpers';

test('should load each project from its own Rstack config', ({ execCli }) => {
  execCli('test');
});

test('should load directory projects independently of the CLI config path', ({
  execCli,
}) => {
  execCli('test --config rstack.config.ts');
});

test('should load file project entries from their Rstack configs', ({
  execCli,
}) => {
  execCli('test --config rstack.file-entries.config.ts');
});
