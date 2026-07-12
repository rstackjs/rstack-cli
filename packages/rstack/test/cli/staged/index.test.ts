import lintStaged from 'lint-staged';
import { beforeEach, rs } from 'rstack/test';
import { test } from '#test-helpers';
import { loadRstackConfig } from '../../../src/config.ts';
import { runStagedCLI, type StagedConfig } from '../../../src/staged.ts';

rs.mock('lint-staged');
rs.mock('../../../src/config.ts');

const mocks = {
  lintStaged: rs.mocked(lintStaged),
  loadRstackConfig: rs.mocked(loadRstackConfig),
};

const stagedConfig: StagedConfig = {
  '*.txt': 'echo test',
};

beforeEach(() => {
  rs.resetAllMocks();
  mocks.lintStaged.mockResolvedValue(true);
  mocks.loadRstackConfig.mockResolvedValue({
    configs: { staged: stagedConfig },
    filePath: null,
    dependencies: [],
  });
});

test('should display the staged help message', ({ execCli, expect }) => {
  const output = execCli('staged --help');

  expect(output).toContain('Rstack v');
  expect(output).toContain('Usage:\n  $ rs staged [options]');
  expect(output).toContain('Runs lint-staged with tasks from define.staged in rstack.config.');
  expect(output).toContain('--allow-empty');
  expect(output).toContain('--cwd <path>');
  expect(output).toContain('-d, --debug');
  expect(output).toContain('--no-stash');
  expect(output).toContain('-q, --quiet');
  expect(output).toContain('-r, --relative');
  expect(output).toContain('-v, --verbose');
  expect(output).toContain('-h, --help');
});

test('should reject unknown staged options', ({ execCli, expect }) => {
  expect(() => execCli('staged --unknown')).toThrow();
});

test('should pass default options to lint-staged', async ({ expect }) => {
  await runStagedCLI([]);

  expect(mocks.lintStaged).toHaveBeenCalledWith({
    allowEmpty: undefined,
    concurrent: undefined,
    config: stagedConfig,
    cwd: undefined,
    debug: undefined,
    quiet: undefined,
    relative: undefined,
    stash: undefined,
    verbose: undefined,
  });
});

test('should pass long options to lint-staged', async ({ expect }) => {
  await runStagedCLI([
    '--allow-empty',
    '--concurrent',
    'false',
    '--cwd',
    'fixture',
    '--debug',
    '--no-stash',
    '--quiet',
    '--relative',
    '--verbose',
  ]);

  expect(mocks.lintStaged).toHaveBeenCalledWith({
    allowEmpty: true,
    concurrent: false,
    config: stagedConfig,
    cwd: 'fixture',
    debug: true,
    quiet: true,
    relative: true,
    stash: false,
    verbose: true,
  });
});

test('should pass short options and aliases to lint-staged', async ({ expect }) => {
  await runStagedCLI(['--allowEmpty', '-p', '1', '-d', '-q', '-r', '-v']);

  expect(mocks.lintStaged).toHaveBeenCalledWith({
    allowEmpty: true,
    concurrent: 1,
    config: stagedConfig,
    cwd: undefined,
    debug: true,
    quiet: true,
    relative: true,
    stash: undefined,
    verbose: true,
  });
});
