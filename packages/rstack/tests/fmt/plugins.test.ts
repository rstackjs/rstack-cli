import { pathToFileURL } from 'node:url';
import { expect, test } from 'rstack/test';
import { createFingerprintResolver, createPluginResolver } from '../../src/fmt/plugins.ts';
import { withTempProject, writeProjectFile } from './helpers.ts';

test('resolves plugin specifiers from the config root', async () => {
  await withTempProject((rootPath) => {
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

    const resolvePlugins = createPluginResolver(rootPath);
    const resolved = resolvePlugins(options);

    expect(resolved.plugins).toEqual([
      pathToFileURL(packageEntry).href,
      pathToFileURL(relativePlugin).href,
      pathToFileURL(absolutePlugin).href,
      pathToFileURL(urlPlugin).href,
      'data:text/javascript,export default {}',
    ]);
    expect(options.plugins[0]).toBe('prettier-plugin-packagejson');
    expect(resolvePlugins(options)).toBe(resolved);
  });
});

test('rejects imported plugin objects', () => {
  const options = { plugins: [{ languages: [] }] };

  expect(() => createPluginResolver(import.meta.dirname)(options)).toThrow(
    'Prettier plugin objects are not supported. Use a package name, path, or URL instead.',
  );
});

test('fingerprints installed package plugins once', async () => {
  await withTempProject(async (rootPath) => {
    const entry = writeProjectFile(rootPath, 'node_modules/prettier-plugin-fixture/dist/index.mjs');
    const packageJsonPath = 'node_modules/prettier-plugin-fixture/package.json';
    writeProjectFile(
      rootPath,
      packageJsonPath,
      JSON.stringify({ name: 'prettier-plugin-fixture', version: '1.2.3' }),
    );

    const resolveFingerprint = createFingerprintResolver();
    const pluginUrl = pathToFileURL(entry);
    const fingerprint = JSON.stringify([
      'package',
      'prettier-plugin-fixture',
      '1.2.3',
      'dist/index.mjs',
    ]);

    await expect(resolveFingerprint(pluginUrl)).resolves.toBe(fingerprint);

    writeProjectFile(
      rootPath,
      packageJsonPath,
      JSON.stringify({ name: 'prettier-plugin-fixture', version: '2.0.0' }),
    );
    await expect(resolveFingerprint(pluginUrl)).resolves.toBe(fingerprint);
  });
});

test('skips plugins without stable package metadata', async () => {
  await withTempProject(async (rootPath) => {
    const localPlugin = writeProjectFile(rootPath, 'plugins/local.mjs');
    const unversionedPlugin = writeProjectFile(
      rootPath,
      'node_modules/prettier-plugin-fixture/index.mjs',
    );
    writeProjectFile(
      rootPath,
      'node_modules/prettier-plugin-fixture/package.json',
      JSON.stringify({ name: 'prettier-plugin-fixture' }),
    );

    const resolveFingerprint = createFingerprintResolver();
    await expect(
      Promise.all([
        resolveFingerprint(pathToFileURL(localPlugin)),
        resolveFingerprint(pathToFileURL(unversionedPlugin)),
        resolveFingerprint('data:text/javascript,export default {}'),
      ]),
    ).resolves.toEqual([undefined, undefined, undefined]);
  });
});
