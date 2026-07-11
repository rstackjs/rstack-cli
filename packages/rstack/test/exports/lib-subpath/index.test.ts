import * as rslib from '@rslib/core';
import { expect, test } from 'rstack/test';

test('should expose all Rslib APIs from `rstack/lib`', async () => {
  const lib = await import('rstack/lib');

  expect(lib).toEqual(rslib);
});
