import * as rsbuild from '@rsbuild/core';
import { expect, test } from 'rstack/test';

test('should expose all Rsbuild APIs from `rstack/app`', async () => {
  const app = await import('rstack/app');

  expect(app).toEqual(rsbuild);
});
