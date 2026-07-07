import { expect, test } from 'rstack/test';

const commonTestMethods = ['test', 'it', 'describe', 'expect', 'beforeAll', 'afterAll'] as const;

test('should expose test APIs from `rstack/test`', async () => {
  const test = await import('rstack/test');

  for (const method of commonTestMethods) {
    expect(test).toHaveProperty(method);
    expect(typeof test[method]).toBeTruthy();
  }
});
