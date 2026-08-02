import { pathToFileURL } from 'node:url';
import { expect, test } from 'rstack/test';
import { normalizeFmtConfig } from '../../src/fmt/config.ts';
import { resolveFmtConfigPlugins } from '../../src/fmt/plugins.ts';
import { withTempProject, writeProjectFile } from './helpers.ts';

test('resolves plugin specifiers from the config root', async () => {
  await withTempProject(async (rootPath) => {
    const packageEntry = writeProjectFile(
      rootPath,
      'node_modules/prettier-plugin-packagejson/import.mjs',
      'export default {};',
    );
    writeProjectFile(
      rootPath,
      'node_modules/prettier-plugin-packagejson/package.json',
      JSON.stringify({
        name: 'prettier-plugin-packagejson',
        exports: {
          import: './import.mjs',
          require: './require.cjs',
        },
      }),
    );
    writeProjectFile(
      rootPath,
      'node_modules/prettier-plugin-packagejson/require.cjs',
      'module.exports = {};',
    );

    const relativePlugin = writeProjectFile(rootPath, 'plugins/relative.mjs');
    const absolutePlugin = writeProjectFile(rootPath, 'plugins/absolute.mjs');
    const urlPlugin = writeProjectFile(rootPath, 'plugins/url.mjs');
    const overridePlugin = writeProjectFile(rootPath, 'plugins/override.mjs');
    const pluginObject = { languages: [] };
    const config = normalizeFmtConfig(
      {
        plugins: [
          'prettier-plugin-packagejson',
          './plugins/relative.mjs',
          absolutePlugin,
          pathToFileURL(urlPlugin),
          'data:text/javascript,export default {}',
          pluginObject,
        ],
        overrides: [
          {
            files: '*.json',
            options: {
              plugins: ['plugins/override.mjs'],
            },
          },
        ],
      },
      rootPath,
    );

    const resolved = resolveFmtConfigPlugins(config);

    expect(resolved.baseOptions.plugins).toEqual([
      pathToFileURL(packageEntry).href,
      pathToFileURL(relativePlugin).href,
      pathToFileURL(absolutePlugin).href,
      pathToFileURL(urlPlugin).href,
      'data:text/javascript,export default {}',
      pluginObject,
    ]);
    expect(resolved.baseOptions.plugins?.at(-1)).toBe(pluginObject);
    expect(resolved.overrides[0].options?.plugins).toEqual([pathToFileURL(overridePlugin).href]);
    expect(config.baseOptions.plugins?.[0]).toBe('prettier-plugin-packagejson');
    expect(config.overrides[0].options?.plugins?.[0]).toBe('plugins/override.mjs');
  });
});

test('does not copy config containing only plugin objects', () => {
  const pluginObject = { languages: [] };
  const config = normalizeFmtConfig(
    {
      plugins: [pluginObject],
      overrides: [{ files: '*.json', options: { plugins: [pluginObject] } }],
    },
    import.meta.dirname,
  );

  expect(resolveFmtConfigPlugins(config)).toBe(config);
});
