import { normalizeHelpOutput, test } from '#test-helpers';

test('displays top-level help', ({ execCli, expect }) => {
  expect(normalizeHelpOutput(execCli('--help'))).toMatchSnapshot();
});
