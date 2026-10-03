import { expect, rs, test } from 'rstack/test';
import { resolveStagedConfig } from '../../src/configLayers.ts';

test('shallowly merges staged globs and replaces task arrays', async () => {
  const generate = rs.fn(() => 'rs fmt');
  const task = rs.fn();
  const config = await resolveStagedConfig([
    {
      staged: {
        '*.ts': ['rs lint', 'rs fmt'],
        '*.md': generate,
        '*.json': { title: 'Check JSON', task },
      },
    },
    { staged: { '*.ts': ['rs check'], '*.css': 'rs fmt' } },
  ]);

  expect(config).toEqual({
    '*.ts': ['rs check'],
    '*.md': generate,
    '*.json': { title: 'Check JSON', task },
    '*.css': 'rs fmt',
  });
  expect(generate).not.toHaveBeenCalled();
  expect(task).not.toHaveBeenCalled();
});

test('a top-level task generator replaces earlier staged config without running', async () => {
  const generate = rs.fn(() => ['rs check']);
  const config = await resolveStagedConfig([
    { staged: { '*.ts': 'rs lint' } },
    { staged: generate },
  ]);

  expect(config).toBe(generate);
  expect(generate).not.toHaveBeenCalled();
});

test('glob maps after a top-level task generator start a new staged config', async () => {
  const generate = rs.fn(() => ['rs check']);
  const config = await resolveStagedConfig([
    { staged: { '*.ts': 'rs lint' } },
    { staged: generate },
    { staged: { '*.md': 'rs fmt' } },
    { staged: { '*.css': 'rs fmt' } },
  ]);

  expect(config).toEqual({ '*.md': 'rs fmt', '*.css': 'rs fmt' });
  expect(generate).not.toHaveBeenCalled();
});
