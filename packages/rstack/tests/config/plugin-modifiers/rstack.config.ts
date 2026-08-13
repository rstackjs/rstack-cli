import { define } from 'rstack';

declare global {
  // rslint-disable-next-line no-var
  var __rstackPluginModifierSetups: number | undefined;
  // rslint-disable-next-line no-var
  var __rstackPluginModifierContext:
    | { cwd: string; command: string; args: readonly string[]; configFilePath: string | null }
    | undefined;
  // rslint-disable-next-line no-var
  var __rstackPluginModifierError: boolean | undefined;
}

define.plugins([
  {
    name: 'config-modifiers',
    setup({ context, modifyConfig }) {
      globalThis.__rstackPluginModifierSetups = (globalThis.__rstackPluginModifierSetups ?? 0) + 1;
      globalThis.__rstackPluginModifierContext = context;
      const setup = globalThis.__rstackPluginModifierSetups;

      modifyConfig('app', (config) => {
        (config as { setup?: number }).setup = setup;
      });
      modifyConfig('app', (config) =>
        Promise.resolve({
          ...config,
          root: `app-${(config as { setup?: number }).setup}`,
        }),
      );
      modifyConfig('app', () => {
        if (globalThis.__rstackPluginModifierError) {
          throw new Error('plugin modifier error');
        }
      });

      modifyConfig('lib', (config) => ({ ...config, root: `lib-${setup}` }));
      modifyConfig('doc', (config) => ({ ...config, root: `doc-${setup}` }));
      modifyConfig('test', (config) => ({
        ...config,
        name: `test-${setup}`,
        reporters: ['dot'],
      }));
      modifyConfig('lint', () => [{ name: `lint-${setup}` }] as never);
      modifyConfig('fmt', (config) => ({ ...config, singleQuote: true }));
      modifyConfig('staged', () => Promise.resolve({ '*.ts': `echo staged-${setup}` }));
    },
  },
]);
