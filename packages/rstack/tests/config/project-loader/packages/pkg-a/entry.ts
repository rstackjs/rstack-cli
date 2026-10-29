import { expect, test } from 'rstack/test';

declare const PROJECT_LABEL: string;

test('should inherit the package app and test config', () => {
  expect(PROJECT_LABEL).toBe('pkg-a');
  expect(typeof (globalThis as Record<string, unknown>).describe).toBe(
    'function',
  );
});
