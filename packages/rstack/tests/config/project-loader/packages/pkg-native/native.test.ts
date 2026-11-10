import { expect, test } from 'rstack/test';

test('should use the default config of an empty project', () => {
  expect(typeof (globalThis as Record<string, unknown>).describe).toBe(
    'undefined',
  );
});
