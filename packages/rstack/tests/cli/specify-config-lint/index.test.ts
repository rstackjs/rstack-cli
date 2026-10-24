import path from 'node:path';
import { test } from '#test-helpers';
import { expect } from 'rstack/test';

// Rslint runs JS plugin rules in worker threads, which must also load the
// config selected by `--config` instead of searching cwd.
test('should run JS plugin rules from --config outside cwd', async ({
  execCli,
  logHelper,
}) => {
  expect(() =>
    execCli('lint -c workspace/app/rstack.config.ts workspace/app/src'),
  ).toThrow();
  await logHelper.expectLog('foo is not allowed');
});

test('should prefer --config JS plugin rules over the cwd config', async ({
  cwd,
  execCli,
  logHelper,
}) => {
  expect(() =>
    execCli('lint -c app/rstack.config.ts app/src', {
      cwd: path.join(cwd, 'workspace'),
    }),
  ).toThrow();
  await logHelper.expectLog('foo is not allowed');
  logHelper.expectNoLog('rule from the cwd config');
});

test('should ignore an inherited config path without --config', async ({
  cwd,
  execCli,
  logHelper,
}) => {
  const workspace = path.join(cwd, 'workspace');
  expect(() =>
    execCli('lint app/src', {
      cwd: workspace,
      env: {
        RSTACK_CLI_CONFIG_PATH: path.join(workspace, 'app/rstack.config.ts'),
      },
    }),
  ).toThrow();
  await logHelper.expectLog('rule from the cwd config');
  logHelper.expectNoLog('foo is not allowed');
});
