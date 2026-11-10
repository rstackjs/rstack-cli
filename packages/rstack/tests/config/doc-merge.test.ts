import { expect, test } from 'rstack/test';
import { resolveRspressConfig } from '../../src/rspressConfig.ts';

test('merges doc layers using native Rspress rules', async () => {
  const sharedRspack = () => ({ name: 'shared' });
  const projectRspack = () => ({ name: 'project' });
  const config = await resolveRspressConfig([
    {
      doc: {
        title: 'Shared',
        plugins: [{ name: 'shared-plugin' }],
        builderConfig: {
          source: { define: { SHARED: true, ENV: 'base' } },
          dev: { watchFiles: [{ paths: ['./shared.md'] }] },
          tools: { rspack: sharedRspack },
        },
      },
    },
    {
      doc: {
        title: 'Project',
        plugins: [{ name: 'project-plugin' }],
        builderConfig: {
          source: { define: { ENV: 'production' } },
          dev: { watchFiles: [{ paths: ['./project.md'] }] },
          tools: { rspack: projectRspack },
        },
      },
    },
  ]);

  expect(config).toEqual({
    title: 'Project',
    plugins: [{ name: 'shared-plugin' }, { name: 'project-plugin' }],
    builderConfig: {
      source: { define: { SHARED: true, ENV: 'production' } },
      dev: {
        watchFiles: [{ paths: ['./shared.md'] }, { paths: ['./project.md'] }],
      },
      tools: { rspack: projectRspack },
    },
  });
});
