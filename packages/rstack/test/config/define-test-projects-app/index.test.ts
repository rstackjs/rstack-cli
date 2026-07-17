import { test } from '#test-helpers';

test('should apply define.app config to every inline test project', ({ execCli }) => {
  execCli('test');
});
