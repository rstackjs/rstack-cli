import { expect, test } from 'rstack/test';
import { parseArgs } from '../../src/cli/args.ts';

test.each([
  ['--long-option', 'kebab'],
  ['--longOption', 'camel'],
] as const)('accepts %s and returns only a camel-case value', (option, value) => {
  const { values } = parseArgs({
    args: [option, value],
    options: {
      'long-option': { type: 'string' },
    },
  });

  expect(values).toEqual({ longOption: value });
  expect('long-option' in values).toBe(false);
});

test('combines repeated kebab-case and camel-case values', () => {
  const { values } = parseArgs({
    args: ['--include-path', 'first', '--includePath', 'second'],
    options: {
      'include-path': { type: 'string', multiple: true },
    },
  });

  expect(values).toEqual({ includePath: ['first', 'second'] });
});

test('omits undefined values', () => {
  const { values } = parseArgs({
    args: [],
    options: {
      'optional-value': { type: 'string' },
    },
  });

  expect(values).toEqual({});
});
