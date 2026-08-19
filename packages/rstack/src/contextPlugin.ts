import { realpath } from 'node:fs/promises';
import { createRstackContextPlugin } from '@rstackjs/context/rstack';
import type { LoadedRstackConfig } from './config.ts';
import type { RstackPlugin } from './plugin.ts';

const createContextPlugin = (
  loaded: LoadedRstackConfig,
  cwd: string,
): RstackPlugin => ({
  name: 'rstack:context',
  async setup(api) {
    const configFilePath =
      loaded.filePath === null ? null : await realpath(loaded.filePath);
    const plugin = createRstackContextPlugin({
      config: loaded.configs.context,
      configDependencies: loaded.dependencies,
      configFilePath,
      cwd,
    });
    plugin.setup(api);
  },
});

export { createContextPlugin };
