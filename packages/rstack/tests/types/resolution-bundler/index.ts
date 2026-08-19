// This folder checks Rstack's exports and APIs with bundler resolution.
import 'rstack/test/globals';
import 'rstack/test/importMeta';
import 'rstack/types';
import {
  define,
  type FmtConfig,
  type RstackConfigMap,
  type RstackPlugin,
  type RstackPlugins,
  type StagedConfig,
} from 'rstack';
import { createRsbuild, defineConfig as defineAppConfig } from 'rstack/app';
import {
  loadRstackConfig,
  type Configs,
  type LoadedRstackConfig,
  type LoadRstackConfigOptions,
} from 'rstack/config';
import { defineConfig as defineLibConfig } from 'rstack/lib';
import { defineConfig as defineLintConfig } from 'rstack/lint';
import { expect as importedExpect, test as importedTest } from 'rstack/test';

const appConfig = defineAppConfig({});
const libConfig = defineLibConfig({});
const lintConfig = defineLintConfig([]);
const loadOptions: LoadRstackConfigOptions = {
  configFilePath: 'rstack.config.ts',
};
const loadedConfig: Promise<LoadedRstackConfig> = loadRstackConfig(loadOptions);
const configs: Configs = {};
const plugin: RstackPlugin = {
  name: 'example',
  setup(api) {
    api.addCommand({ name: 'example', handler: () => Promise.resolve() });
    api.modifyConfig('app', (config) => config);
    api.modifyConfig('test', (config) => Promise.resolve(config));
    api.logger.info(api.context.command);
  },
};
const plugins: RstackPlugins = [
  plugin,
  false,
  Promise.resolve([undefined, plugin]),
];
const fmtConfig: FmtConfig = {};
const stagedConfig: StagedConfig = {};
const appConfigFromMap: RstackConfigMap['app'] = appConfig;

void loadedConfig;
void configs;
void fmtConfig;
void stagedConfig;
void appConfigFromMap;

void createRsbuild({ config: appConfig });
define.app(appConfig);
define.lib(libConfig);
define.lint(lintConfig);
define.lint(({ js, ts }) => [
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
]);
define.doc({});
define.test({});
define.staged({});
define.plugins(plugins);

importedTest('exposes the Rstest APIs', () => {
  importedExpect(true).toBe(true);
});
