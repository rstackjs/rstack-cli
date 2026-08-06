import { expect, test } from 'rstack/test';

test('should expose only the config loader API from `rstack/config`', async () => {
  const config = await import('rstack/config');

  expect(Object.keys(config)).toEqual(['loadRstackConfig']);
});
