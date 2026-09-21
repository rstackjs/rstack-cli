import type { ConfigParams } from 'rstack/app';
import { expect, rs, test } from 'rstack/test';
import { resolveConfigLayers } from '../../src/configLayers.ts';

test('resolves only the selected tool sequentially with native parameters', async () => {
  const order: string[] = [];
  const base = async ({ env }: ConfigParams) => {
    await Promise.resolve();
    order.push('base');
    return { root: env };
  };
  const project = ({ command }: ConfigParams) => {
    order.push('project');
    return { root: command };
  };
  const unrelated = rs.fn(() => ({}));
  const layers = [{ app: base }, { app: project, fmt: unrelated }];

  expect(
    await resolveConfigLayers(layers, 'app', {
      command: 'build',
      env: 'production',
    }),
  ).toEqual([{ root: 'production' }, { root: 'build' }]);
  expect(order).toEqual(['base', 'project']);
  expect(unrelated).not.toHaveBeenCalled();
});

test('skips missing definitions while preserving explicitly empty configs', async () => {
  const layers = [{}, { test: {}, lint: [] }, { test: () => ({ retry: 1 }) }];

  expect(await resolveConfigLayers(layers, 'test')).toEqual([{}, { retry: 1 }]);
  expect(await resolveConfigLayers(layers, 'lint')).toEqual([[]]);
  expect(await resolveConfigLayers(layers, 'fmt')).toEqual([]);
});

test('preserves staged task generators without invoking them', async () => {
  const generator = rs.fn(() => ['rs fmt']);
  const tasks = { '*.ts': 'rs lint' };
  const layers = [{ staged: tasks }, { staged: generator }];

  expect(await resolveConfigLayers(layers, 'staged')).toEqual([
    tasks,
    generator,
  ]);
  expect(generator).not.toHaveBeenCalled();
});

test('stops at a failed factory and preserves its error', async () => {
  const error = new Error('Invalid shared config');
  const project = rs.fn(() => ({}));
  const layers = [{ fmt: () => Promise.reject(error) }, { fmt: project }];

  await expect(resolveConfigLayers(layers, 'fmt')).rejects.toBe(error);
  expect(project).not.toHaveBeenCalled();
});
