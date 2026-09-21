import type { ConfigParams, RsbuildConfig } from 'rstack/app';
import { expect, rs, test } from 'rstack/test';
import { resolveRsbuildConfig } from '../../src/rsbuildConfig.ts';

const params: ConfigParams = { command: 'build', env: 'production' };

test('merges app layers using native Rsbuild rules', async () => {
  const basePlugin = { name: 'base', setup: rs.fn() };
  const projectPlugin = { name: 'project', setup: rs.fn() };
  const baseRspack = rs.fn();
  const projectRspack = rs.fn();
  const base: RsbuildConfig = {
    source: { define: { SHARED: true, ENV: 'base' } },
    output: { distPath: 'build' },
    plugins: [basePlugin],
    tools: { rspack: baseRspack },
  };
  const project = rs.fn(({ env }: ConfigParams) =>
    Promise.resolve({
      source: { define: { ENV: env } },
      output: { distPath: 'dist' },
      plugins: [projectPlugin],
      tools: { rspack: projectRspack },
    }),
  );

  const config = await resolveRsbuildConfig(
    [{ app: base }, { app: project }],
    params,
  );

  expect(project).toHaveBeenCalledExactlyOnceWith(params);
  expect(config).toEqual({
    source: { define: { SHARED: true, ENV: 'production' } },
    output: { distPath: { root: 'dist' } },
    plugins: [basePlugin, projectPlugin],
    tools: { rspack: [baseRspack, projectRspack] },
  });
  expect(base.source?.define).toEqual({ SHARED: true, ENV: 'base' });
  expect(base.output?.distPath).toBe('build');
  expect(base.plugins).toEqual([basePlugin]);
  expect(baseRspack).not.toHaveBeenCalled();
  expect(projectRspack).not.toHaveBeenCalled();
});

test('keeps the empty app default without resolving other tools', async () => {
  const fmt = rs.fn(() => ({}));

  expect(await resolveRsbuildConfig([{ fmt }], params)).toEqual({});
  expect(fmt).not.toHaveBeenCalled();
});
