import { define } from 'rstack';

declare global {
  // rslint-disable-next-line no-var
  var __rstackExplicitAppModifierCalls: number | undefined;
}

define.plugins([
  {
    name: 'explicit-extends',
    setup({ modifyConfig }) {
      modifyConfig('app', (config) => {
        globalThis.__rstackExplicitAppModifierCalls =
          (globalThis.__rstackExplicitAppModifierCalls ?? 0) + 1;
        return config;
      });
      modifyConfig('test', (config) => ({ ...config, reporters: ['dot'] }));
    },
  },
]);

define.app({});
define.test({
  extends: {},
});
