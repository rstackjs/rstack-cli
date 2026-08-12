import { expect, test } from 'rstack/test';
import type { RstackPlugins } from '../src/plugin.ts';
import { createPluginRuntime } from '../src/pluginRuntime.ts';

const logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  success() {},
};

test('flattens nested asynchronous plugins in declaration order and initializes them sequentially', async () => {
  const events: string[] = [];
  const runtime = await createPluginRuntime({
    plugins: [
      {
        name: 'first',
        async setup() {
          events.push('first:start');
          await Promise.resolve();
          events.push('first:end');
        },
      },
      false,
      Promise.resolve([
        {
          name: 'second',
          setup() {
            events.push('second');
          },
        },
        [
          undefined,
          {
            name: 'third',
            setup() {
              events.push('third');
            },
          },
        ],
      ]),
    ],
    context: {
      cwd: '/project',
      command: 'plugin-command',
      args: ['--raw'],
      configFilePath: '/project/rstack.config.ts',
    },
    logger,
  });

  expect(events).toEqual(['first:start', 'first:end', 'second', 'third']);
  expect(runtime.context).toEqual({
    cwd: '/project',
    command: 'plugin-command',
    args: ['--raw'],
    configFilePath: '/project/rstack.config.ts',
  });
});

test('rejects invalid plugin objects and duplicate plugin names', async () => {
  const options = {
    context: {
      cwd: '/project',
      command: 'command',
      args: [],
      configFilePath: null,
    },
    logger,
  };

  await expect(
    createPluginRuntime({
      ...options,
      plugins: [true] as unknown as RstackPlugins,
    }),
  ).rejects.toThrow('Invalid Rstack plugin');
  await expect(createPluginRuntime({ ...options, plugins: {} as RstackPlugins })).rejects.toThrow(
    'Invalid Rstack plugins',
  );
  await expect(
    createPluginRuntime({
      ...options,
      plugins: [{ name: 'not valid', setup() {} }],
    }),
  ).rejects.toThrow('Invalid Rstack plugin name');
  await expect(
    createPluginRuntime({
      ...options,
      plugins: [
        { name: 'duplicate', setup() {} },
        { name: 'duplicate', setup() {} },
      ],
    }),
  ).rejects.toThrow('Duplicate Rstack plugin');
});

test('rejects invalid config modifier registrations', async () => {
  const options = {
    context: {
      cwd: '/project',
      command: 'command',
      args: [],
      configFilePath: null,
    },
    logger,
  };

  await expect(
    createPluginRuntime({
      ...options,
      plugins: [
        {
          name: 'invalid-kind',
          setup({ modifyConfig }) {
            modifyConfig('unknown' as never, () => {});
          },
        },
      ],
    }),
  ).rejects.toThrow('Invalid Rstack config kind');
  await expect(
    createPluginRuntime({
      ...options,
      plugins: [
        {
          name: 'invalid-handler',
          setup({ modifyConfig }) {
            modifyConfig('app', undefined as never);
          },
        },
      ],
    }),
  ).rejects.toThrow('Invalid Rstack app config modifier');
});

test('validates every plugin before setup begins', async () => {
  let setupRan = false;

  await expect(
    createPluginRuntime({
      plugins: [
        {
          name: 'valid',
          setup() {
            setupRan = true;
          },
        },
        { name: 'invalid' } as never,
      ],
      context: {
        cwd: '/project',
        command: 'command',
        args: [],
        configFilePath: null,
      },
      logger,
    }),
  ).rejects.toThrow('Expected a setup function');
  expect(setupRan).toBe(false);
});

test('rejects invalid, duplicate, and built-in command names', async () => {
  const options = {
    context: {
      cwd: '/project',
      command: 'command',
      args: [],
      configFilePath: null,
    },
    logger,
  };

  await expect(
    createPluginRuntime({
      ...options,
      plugins: [
        {
          name: 'invalid-command',
          setup({ addCommand }) {
            addCommand({ name: 'not valid', handler() {} });
          },
        },
      ],
    }),
  ).rejects.toThrow('Invalid Rstack command name');
  await expect(
    createPluginRuntime({
      ...options,
      plugins: [
        {
          name: 'duplicate-command',
          setup({ addCommand }) {
            addCommand({ name: 'plugin-command', handler() {} });
            addCommand({ name: 'plugin-command', handler() {} });
          },
        },
      ],
    }),
  ).rejects.toThrow('Duplicate Rstack command');
  for (const name of [
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
  ]) {
    await expect(
      createPluginRuntime({
        ...options,
        plugins: [
          {
            name: `built-in-${name}`,
            setup({ addCommand }) {
              addCommand({ name, handler() {} });
            },
          },
        ],
      }),
    ).rejects.toThrow('conflicts with a built-in command');
  }
});

test('runs config modifiers after setup and keeps each modifier result', async () => {
  const runtime = await createPluginRuntime({
    plugins: [
      {
        name: 'modifier',
        setup({ modifyConfig }) {
          modifyConfig('app', (config) => {
            config.root = '/first';
          });
          modifyConfig('app', (config) => ({
            ...config,
            root: `${config.root}/second`,
          }));
          modifyConfig('app', async (config) => ({
            ...config,
            root: `${config.root}/third`,
          }));
        },
      },
    ],
    context: {
      cwd: '/project',
      command: 'command',
      args: [],
      configFilePath: null,
    },
    logger,
  });

  expect(runtime.hasConfigModifier('app')).toBe(true);
  expect(runtime.hasConfigModifier('lib')).toBe(false);
  await expect(runtime.applyConfigModifiers('app', {})).resolves.toMatchObject({
    root: '/first/second/third',
  });
});
