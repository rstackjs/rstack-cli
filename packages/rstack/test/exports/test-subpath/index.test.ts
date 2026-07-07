import { expect, test } from '@rstest/core';

const commonTestMethods = ['test', 'it', 'describe', 'expect', 'beforeAll', 'afterAll'] as const;

test('should expose common test APIs from rstack/test', async () => {
  const rstackTest = await import('rstack/test');

  for (const method of commonTestMethods) {
    expect(rstackTest).toHaveProperty(method);
    expect(typeof rstackTest[method]).toBe('function');
  }
});
