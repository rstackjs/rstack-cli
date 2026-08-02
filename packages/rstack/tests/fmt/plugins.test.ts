import { pathToFileURL } from 'node:url';
import { expect, test } from 'rstack/test';
import { createFmtPluginResolver } from '../../src/fmt/plugins.ts';
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
    const options = {
      plugins: [
        'prettier-plugin-packagejson',
        './plugins/relative.mjs',
        absolutePlugin,
        pathToFileURL(urlPlugin),
        'data:text/javascript,export default {}',
      ],
    };

    const resolved = createFmtPluginResolver(rootPath)(options);

    expect(resolved.plugins).toEqual([
      pathToFileURL(packageEntry).href,
      pathToFileURL(relativePlugin).href,
      pathToFileURL(absolutePlugin).href,
      pathToFileURL(urlPlugin).href,
      'data:text/javascript,export default {}',
    ]);
    expect(options.plugins[0]).toBe('prettier-plugin-packagejson');
  });
});

test('rejects imported plugin objects', () => {
  const options = { plugins: [{ languages: [] }] };

  expect(() => createFmtPluginResolver(import.meta.dirname)(options)).toThrow(
    'Prettier plugin objects are not supported. Use a package name, path, or URL instead.',
  );
});
