import { test } from '#test-helpers';

test('should prefer define.app when app and lib are both defined', ({ execCli }) => {
  execCli('test');
});
