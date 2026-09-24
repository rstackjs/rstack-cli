import { expect, test } from 'rstack/test';
import { resolveRslibConfig } from '../../src/rslibConfig.ts';

test('merges lib layers using native Rslib rules', async () => {
  const config = await resolveRslibConfig(
    [
      {
        lib: {
          source: { define: { SHARED: true, ENV: 'base' } },
          lib: [{ id: 'esm', format: 'esm', dts: true }],
        },
      },
      {
        lib: {
          source: { define: { ENV: 'production' } },
          lib: [{ id: 'esm', dts: false }, { format: 'cjs' }],
        },
      },
    ],
    { command: 'build', env: 'production' },
  );

  expect(config).toEqual({
    source: { define: { SHARED: true, ENV: 'production' } },
    lib: [{ id: 'esm', format: 'esm', dts: false }, { format: 'cjs' }],
  });
});
