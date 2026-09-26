import type { RslintConfig } from '@rslint/core';
import { expect, test } from 'rstack/test';
import { normalizeRstackConfig } from '../../src/config.ts';
import { resolveRslintConfig } from '../../src/configLayers.ts';

test('concatenates lint layers in order without merging entries', async () => {
  const shared: RslintConfig = [
    { ignores: ['dist/**'] },
    [{ files: ['**/*.js'], rules: { 'no-debugger': 'error' } }],
  ];
  const project: RslintConfig = [{ rules: { 'no-debugger': 'off' } }];

  const config = await resolveRslintConfig([
    { lint: shared },
    normalizeRstackConfig({ lint: () => Promise.resolve(project) }),
  ]);

  expect(config).toEqual([...shared, ...project]);
});

test('preserves a single lint config and distinguishes missing from empty', async () => {
  const config: RslintConfig = [];

  expect(await resolveRslintConfig([{}])).toBeUndefined();
  expect(await resolveRslintConfig([{}, { lint: config }])).toBe(config);
});
