import { expect, test } from 'rstack/test';

const commonLintMethods = ['js', 'ts', 'Rslint'] as const;

test('should expose lint APIs from `rstack/lint`', async () => {
  const lint = await import('rstack/lint');

  for (const method of commonLintMethods) {
    expect(lint).toHaveProperty(method);
    expect(typeof lint[method]).toBeTruthy();
  }
});
