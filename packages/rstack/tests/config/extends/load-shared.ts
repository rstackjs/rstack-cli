import { loadRstackConfig } from '../../../src/config.ts';
import { resolveConfigLayers } from '../../../src/configLayers.ts';

const { configs, filePath, dependencies } = await loadRstackConfig({
  cwd: import.meta.dirname,
});
const layers = [configs];
const params = { command: 'build', env: 'production' } as const;

console.log(
  JSON.stringify({
    configs: {
      app: await resolveConfigLayers(layers, 'app', params),
      lib: await resolveConfigLayers(layers, 'lib', params),
      doc: await resolveConfigLayers(layers, 'doc'),
      test: await resolveConfigLayers(layers, 'test'),
      lint: await resolveConfigLayers(layers, 'lint'),
      fmt: await resolveConfigLayers(layers, 'fmt'),
      staged: await resolveConfigLayers(layers, 'staged'),
    },
    filePath,
    dependencies,
  }),
);
