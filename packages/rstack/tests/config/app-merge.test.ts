import { expect, test } from 'rstack/test';
import { resolveRsbuildConfig } from '../../src/rsbuildConfig.ts';

test('merges app layers using native Rsbuild rules', async () => {
  const config = await resolveRsbuildConfig(
    [
      {
        app: {
          source: {
            define: { SHARED: true, ENV: 'base' },
            preEntry: ['./base.ts'],
          },
        },
      },
      {
        app: {
          source: {
            define: { ENV: 'production' },
            preEntry: ['./project.ts'],
          },
        },
      },
    ],
    { command: 'build', env: 'production' },
  );

  expect(config.source).toEqual({
    define: { SHARED: true, ENV: 'production' },
    preEntry: ['./base.ts', './project.ts'],
  });
});
