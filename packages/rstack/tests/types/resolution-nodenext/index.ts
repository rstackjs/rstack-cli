// This folder checks Rstack's exports and APIs with NodeNext resolution.
import 'rstack/test/globals';
import 'rstack/test/importMeta';
import 'rstack/types';
import { define } from 'rstack';
import { createRsbuild, defineConfig as defineAppConfig } from 'rstack/app';
import { defineConfig as defineLibConfig } from 'rstack/lib';
import { js, ts } from 'rstack/lint';
import { expect as importedExpect, test as importedTest } from 'rstack/test';

const appConfig = defineAppConfig({});
const libConfig = defineLibConfig({});

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
