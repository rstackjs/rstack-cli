import { test } from '#test-helpers';

test('should apply define.lib config to every inline test project', ({ execCli }) => {
  execCli('test');
});
