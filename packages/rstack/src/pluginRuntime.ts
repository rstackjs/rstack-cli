import type {
  RstackCommand,
  RstackConfigMap,
  RstackLogger,
  RstackPlugin,
  RstackPluginContext,
  RstackPlugins,
} from './plugin.ts';

export type RstackConfigModifier<K extends keyof RstackConfigMap> = (
  config: RstackConfigMap[K],
) => void | RstackConfigMap[K] | Promise<void | RstackConfigMap[K]>;

type RstackConfigModifierRegistry = {
  [K in keyof RstackConfigMap]: RstackConfigModifier<K>[];
};

export type RstackPluginRuntime = {
  readonly context: RstackPluginContext;
  hasConfigModifier(kind: keyof RstackConfigMap): boolean;
  runCommand(name: string, args: readonly string[]): Promise<boolean>;
  applyConfigModifiers<K extends keyof RstackConfigMap>(
    kind: K,
    config: RstackConfigMap[K],
  ): Promise<RstackConfigMap[K]>;
};

export type CreatePluginRuntimeOptions = {
  plugins: RstackPlugins;
  context: RstackPluginContext;
  logger: RstackLogger;
  reservedCommands?: Iterable<string>;
};

const validCommandName = /^[a-z][a-z0-9-]*$/u;

const builtInCommandNames = [
  'dev',
  'build',
  'preview',
  'lib',
  'doc',
  'test',
  'lint',
  'check',
  'fmt',
  'format',
  'staged',
  'setup',
];

const hasValidName = (name: unknown): name is string =>
  typeof name === 'string' &&
  name.length > 0 &&
  name.trim() === name &&
  !/\s/u.test(name);

const flattenPlugins = async (
  plugins: RstackPlugins,
): Promise<RstackPlugin[]> => {
  if (!Array.isArray(plugins)) {
    throw new Error('Invalid Rstack plugins. Expected an array.');
  }

  const result: RstackPlugin[] = [];

  const visit = async (value: RstackPlugins[number]): Promise<void> => {
    const resolved = await value;

    if (resolved === false || resolved === null || resolved === undefined) {
      return;
    }

    if (Array.isArray(resolved)) {
      for (const plugin of resolved) {
        await visit(plugin);
      }
      return;
    }

    result.push(resolved);
  };

  for (const plugin of plugins) {
    await visit(plugin);
  }

  return result;
};

const assertPlugin = (plugin: RstackPlugin): void => {
  if (!plugin || typeof plugin !== 'object' || Array.isArray(plugin)) {
    throw new Error('Invalid Rstack plugin. Expected a plugin object.');
  }

  if (!hasValidName(plugin.name)) {
    throw new Error(
      'Invalid Rstack plugin name. Plugin names must be non-empty strings without whitespace.',
    );
  }

  if (typeof plugin.setup !== 'function') {
    throw new Error(
      `Invalid Rstack plugin "${plugin.name}". Expected a setup function.`,
    );
  }
};

const createModifierRegistry = (): RstackConfigModifierRegistry => ({
  app: [],
  lib: [],
  doc: [],
  test: [],
  lint: [],
  fmt: [],
  staged: [],
});

export const createPluginRuntime = async ({
  plugins,
  context,
  logger,
  reservedCommands = builtInCommandNames,
}: CreatePluginRuntimeOptions): Promise<RstackPluginRuntime> => {
  const commands = new Map<string, RstackCommand['handler']>();
  const configModifiers = createModifierRegistry();
  const pluginNames = new Set<string>();
  const reservedCommandNames = new Set(reservedCommands);

  const addCommand = (command: RstackCommand): void => {
    if (!command || typeof command !== 'object' || Array.isArray(command)) {
      throw new Error('Invalid Rstack command. Expected a command object.');
    }

    if (!validCommandName.test(command.name)) {
      throw new Error(
        'Invalid Rstack command name. Command names must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens.',
      );
    }

    if (typeof command.handler !== 'function') {
      throw new Error(
        `Invalid Rstack command "${command.name}". Expected a handler function.`,
      );
    }

    if (reservedCommandNames.has(command.name)) {
      throw new Error(
        `Rstack command "${command.name}" conflicts with a built-in command.`,
      );
    }

    if (commands.has(command.name)) {
      throw new Error(`Duplicate Rstack command: "${command.name}".`);
    }

    commands.set(command.name, command.handler);
  };

  const runtime: RstackPluginRuntime = {
    context,
    hasConfigModifier(kind) {
      return configModifiers[kind].length > 0;
    },
    async runCommand(name, args) {
      const handler = commands.get(name);
      if (!handler) {
        return false;
      }
      await handler(args);
      return true;
    },
    async applyConfigModifiers(kind, config) {
      let current = config;
      for (const modifier of configModifiers[kind] as RstackConfigModifier<
        typeof kind
      >[]) {
        const result = await modifier(current);
        if (result !== undefined) {
          current = result;
        }
      }
      return current;
    },
  };

  const resolvedPlugins = await flattenPlugins(plugins);
  for (const plugin of resolvedPlugins) {
    assertPlugin(plugin);

    if (pluginNames.has(plugin.name)) {
      throw new Error(`Duplicate Rstack plugin: "${plugin.name}".`);
    }
    pluginNames.add(plugin.name);
  }

  for (const plugin of resolvedPlugins) {
    await plugin.setup({
      context,
      logger,
      addCommand,
      modifyConfig(kind, handler) {
        if (!Object.hasOwn(configModifiers, kind)) {
          throw new Error(`Invalid Rstack config kind: "${String(kind)}".`);
        }
        if (typeof handler !== 'function') {
          throw new Error(
            `Invalid Rstack ${kind} config modifier. Expected a function.`,
          );
        }
        (configModifiers[kind] as RstackConfigModifier<typeof kind>[]).push(
          handler,
        );
      },
    });
  }

  return runtime;
};
