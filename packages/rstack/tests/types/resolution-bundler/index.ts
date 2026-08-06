// This folder checks Rstack's exports and APIs with bundler resolution.
import 'rstack/test/globals';
import 'rstack/test/importMeta';
import 'rstack/types';
import { define } from 'rstack';
import { createRsbuild, defineConfig as defineAppConfig } from 'rstack/app';
import {
  loadRstackConfig,
  type Configs,
  type LoadedRstackConfig,
  type LoadRstackConfigOptions,
} from 'rstack/config';
import { defineConfig as defineLibConfig } from 'rstack/lib';
import { js, ts } from 'rstack/lint';
import { expect as importedExpect, test as importedTest } from 'rstack/test';

const appConfig = defineAppConfig({});
const libConfig = defineLibConfig({});
const loadOptions: LoadRstackConfigOptions = { configFilePath: 'rstack.config.ts' };
const loadedConfig: Promise<LoadedRstackConfig> = loadRstackConfig(loadOptions);
const configs: Configs = {};

void loadedConfig;
void configs;

createRsbuild({ config: appConfig });
define.app(appConfig);
define.lib(libConfig);
define.doc({});
define.test({});
define.lint([js.configs.recommended, ts.configs.recommended]);
define.staged({});

importedTest('exposes the Rstest APIs', () => {
  importedExpect(true).toBe(true);
});
