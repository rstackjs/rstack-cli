import lintStaged from 'lint-staged';
import { afterEach, beforeEach, rs } from 'rstack/test';
import { normalizeHelpOutput, test } from '#test-helpers';
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
  delete process.env.RSTACK_STAGED;
  rs.resetAllMocks();
  mocks.lintStaged.mockResolvedValue(true);
  mocks.loadRstackConfig.mockResolvedValue({
    configs: { staged: stagedConfig },
    filePath: null,
    dependencies: [],
  });
});

afterEach(() => {
  delete process.env.RSTACK_STAGED;
});

test('should display the staged help message', ({ execCli, expect }) => {
  const output = execCli('staged --help');

  expect(normalizeHelpOutput(output)).toMatchSnapshot();
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

test('should set the staged environment', async ({ expect }) => {
  mocks.lintStaged.mockImplementation(async () => {
    expect(process.env.RSTACK_STAGED).toBe('1');
    return true;
  });

  await runStagedCLI([]);

  expect(process.env.RSTACK_STAGED).toBe('1');
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

test('should pass short options to lint-staged', async ({ expect }) => {
  await runStagedCLI(['-p', '1', '-d', '-q', '-r', '-v']);

  expect(mocks.lintStaged).toHaveBeenCalledWith({
    allowEmpty: undefined,
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
