import { normalizeHelpOutput, test } from '#test-helpers';
import { hasHelpFlag } from '../../src/cli/help.ts';

test('detects help flags before the option terminator', ({ expect }) => {
  expect(hasHelpFlag(['dev', '-h'])).toBe(true);
  expect(hasHelpFlag(['dev', '--help'])).toBe(true);
  expect(hasHelpFlag(['dev', '--', '--help'])).toBe(false);
  expect(hasHelpFlag(['dev'])).toBe(false);
});

test('displays top-level help', ({ execCli, expect }) => {
  expect(normalizeHelpOutput(execCli('--help'))).toMatchSnapshot();
});

for (const command of ['dev', 'build', 'preview']) {
  test(`displays ${command} help`, ({ execCli, expect }) => {
    const output = execCli(`${command} --help`);

    expect(execCli(`${command} -h`)).toBe(output);
    expect(normalizeHelpOutput(output)).toMatchSnapshot();
  });
}

for (const command of ['lib', 'lib build', 'lib inspect', 'lib mf-dev']) {
  test(`displays ${command} help`, ({ execCli, expect }) => {
    const output = execCli(`${command} --help`);

    expect(execCli(`${command} -h`)).toBe(output);
    expect(normalizeHelpOutput(output)).toMatchSnapshot();
  });
}

for (const command of [
  'test',
  'test run',
  'test watch',
  'test list',
  'test merge-reports',
  'test init',
]) {
  test(`displays ${command} help`, ({ execCli, expect }) => {
    const output = execCli(`${command} --help`);

    expect(execCli(`${command} -h`)).toBe(output);
    expect(normalizeHelpOutput(output)).toMatchSnapshot();
  });
}
