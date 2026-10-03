import { expect, rs, test } from 'rstack/test';
import type { RstackConfig } from '../../src/config.ts';
import { flattenConfigLayers } from '../../src/configLayers.ts';

test('flattens nested configs in order and preserves repeated references without resolving factories', () => {
  const app = rs.fn(() => ({}));
  const base = { app, fmt: { printWidth: 80 } };
  const left = { extends: [base], fmt: { singleQuote: true } };
  const nested = { extends: [left], fmt: { semi: false } };
  const right = { extends: [base], fmt: { tabWidth: 4 } };
  const configs: readonly RstackConfig[] = [nested, right, base];

  expect(flattenConfigLayers(configs)).toEqual([
    base,
    { fmt: { singleQuote: true } },
    { fmt: { semi: false } },
    base,
    { fmt: { tabWidth: 4 } },
    base,
  ]);
  expect(app).not.toHaveBeenCalled();
  expect(configs).toEqual([
    {
      extends: [{ extends: [base], fmt: { singleQuote: true } }],
      fmt: { semi: false },
    },
    { extends: [base], fmt: { tabWidth: 4 } },
    base,
  ]);
});

test('reports the inheritance positions of a direct cycle', () => {
  const config: RstackConfig = {};
  config.extends = [config];

  expect(() => flattenConfigLayers([config])).toThrow(
    'Circular config inheritance at extends[0].extends[0]: references extends[0].',
  );
});

test('reports the inheritance positions of an indirect cycle', () => {
  const first: RstackConfig = {};
  const second: RstackConfig = { extends: [first] };
  first.extends = [second];

  expect(() => flattenConfigLayers([first])).toThrow(
    'Circular config inheritance at extends[0].extends[0].extends[0]: references extends[0].',
  );
});
