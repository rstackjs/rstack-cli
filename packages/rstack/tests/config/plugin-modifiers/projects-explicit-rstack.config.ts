import { define } from 'rstack';

declare global {
  // rslint-disable-next-line no-var
  var __rstackAllProjectsExplicitAppModifierCalls: number | undefined;
}

define.plugins([
  {
    name: 'all-projects-explicit',
    setup({ modifyConfig }) {
      modifyConfig('app', (config) => {
        globalThis.__rstackAllProjectsExplicitAppModifierCalls =
          (globalThis.__rstackAllProjectsExplicitAppModifierCalls ?? 0) + 1;
        return config;
      });
      modifyConfig('test', (config) => ({ ...config, reporters: ['dot'] }));
    },
  },
]);

define.app({});
define.test({
  projects: [{ name: 'explicit', extends: {} }],
});
