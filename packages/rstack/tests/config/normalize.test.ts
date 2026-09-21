import { expect, rs, test } from 'rstack/test';
import { normalizeRstackConfig, type RstackConfig } from '../../src/config.ts';
import { resolveConfigLayers } from '../../src/configLayers.ts';

test('preserves tool definitions without resolving factories or inheritance', () => {
  const app = rs.fn(() => ({}));
  const staged = rs.fn(() => ['rs lint']);
  const shared: RstackConfig = {
    extends: [{ fmt: { singleQuote: true } }],
    app,
    staged,
  };

  expect(normalizeRstackConfig(shared)).toEqual({ app, staged });
  expect(shared.extends).toEqual([{ fmt: { singleQuote: true } }]);
  expect(app).not.toHaveBeenCalled();
  expect(staged).not.toHaveBeenCalled();
});

test('resolves sync and async lint factories lazily with tool exports', async () => {
  const syncLint = rs.fn((lint: typeof import('@rslint/core')) => [
    lint.js.configs.recommended,
  ]);
  const asyncLint = rs.fn((lint: typeof import('@rslint/core')) =>
    Promise.resolve([lint.ts.configs.recommended]),
  );
  const shared: RstackConfig[] = [
    { lint: [] },
    { lint: syncLint },
    { lint: asyncLint },
  ];
  const configs = shared.map(normalizeRstackConfig);

  expect(syncLint).not.toHaveBeenCalled();
  expect(asyncLint).not.toHaveBeenCalled();
  expect(shared[1].lint).toBe(syncLint);

  const resolved = await resolveConfigLayers(configs, 'lint');
  const { js, ts } = await import('@rslint/core');

  expect(resolved).toEqual([
    [],
    [js.configs.recommended],
    [ts.configs.recommended],
  ]);
});
