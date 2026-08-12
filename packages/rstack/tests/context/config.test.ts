import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { loadRstackConfig } from '../../src/config.ts';
import { resolveContextCapture } from '../../src/context/config.ts';

const withTempConfig = async (
  source: string,
  callback: (configPath: string) => Promise<void>,
): Promise<void> => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rstack-context-config-'));
  const configPath = path.join(directory, 'rstack.config.ts');

  try {
    await writeFile(configPath, source);
    await callback(configPath);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};

test('resolves context capture with explicit opt-out precedence', () => {
  expect(resolveContextCapture(undefined, undefined)).toBe('off');
  expect(resolveContextCapture({ enabled: true }, undefined)).toBe('metadata');
  expect(resolveContextCapture({ enabled: true, capture: 'deep' }, undefined)).toBe('deep');
  expect(resolveContextCapture({ enabled: true, capture: 'off' }, '1')).toBe('off');
  expect(resolveContextCapture({ enabled: true }, '0')).toBe('off');
  expect(resolveContextCapture(undefined, '1')).toBe('metadata');
});

test('loads context config separately from app and library configs', async () => {
  const configModulePath = path.join(import.meta.dirname, '../../src/config.ts');

  await withTempConfig(
    [
      `import { define } from ${JSON.stringify(configModulePath)};`,
      "define.app({ root: 'app-root' });",
      "define.lib({ lib: ['src/index.ts'] });",
      "define.context({ capture: 'deep', enabled: true });",
    ].join('\n'),
    async (configFilePath) => {
      const { configs } = await loadRstackConfig({ configFilePath });

      expect(configs).toEqual({
        app: { root: 'app-root' },
        lib: { lib: ['src/index.ts'] },
        context: { capture: 'deep', enabled: true },
      });
    },
  );
});
