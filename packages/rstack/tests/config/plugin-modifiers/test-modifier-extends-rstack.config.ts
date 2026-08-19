import { define } from 'rstack';

declare global {
  // rslint-disable-next-line no-var
  var __rstackTestModifierExtendsAppCalls: number | undefined;
}

define.plugins([
  {
    name: 'test-modifier-extends',
    setup({ modifyConfig }) {
      modifyConfig('app', (config) => {
        globalThis.__rstackTestModifierExtendsAppCalls =
          (globalThis.__rstackTestModifierExtendsAppCalls ?? 0) + 1;
        return { ...config, root: 'automatic' };
      });
      modifyConfig('test', (config) => ({
        ...config,
        extends: { root: 'test-modifier' },
      }));
    },
  },
]);

define.test({});
