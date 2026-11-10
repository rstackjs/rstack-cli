import { expect, rs, test } from 'rstack/test';
import { normalizeRstackConfig } from '../../src/config.ts';
import { resolveConfigLayers } from '../../src/configLayers.ts';

test('preserves tool definitions without resolving factories or inheritance', () => {
  const app = rs.fn(() => ({}));
  const config = normalizeRstackConfig({
    extends: [
      {
        fmt: { singleQuote: true },
      },
    ],
    app,
    lint: [],
  });

  expect(config).toEqual({ app, lint: [] });
  expect(app).not.toHaveBeenCalled();
});

test('wraps lint factories lazily with tool exports', async () => {
  const lint = rs.fn((lint: typeof import('@rslint/core')) =>
    Promise.resolve([lint.js.configs.recommended]),
  );
  const config = normalizeRstackConfig({ lint });

  expect(lint).not.toHaveBeenCalled();

  const { js } = await import('@rslint/core');
  expect(await resolveConfigLayers([config], 'lint')).toEqual([
    [js.configs.recommended],
  ]);
});
