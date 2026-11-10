import { define } from 'rstack';

type Context = { report: (descriptor: object) => void };

// Registers the same plugin name as `app/rstack.config.ts` with another rule.
define.lint([
  {
    plugins: {
      local: {
        rules: {
          'no-foo': {
            meta: { messages: { cwd: 'rule from the cwd config' } },
            create: (context: Context) => ({
              Program(node: object) {
                context.report({ node, messageId: 'cwd' });
              },
            }),
          },
        },
      },
    },
    rules: { 'local/no-foo': 'error' },
  },
]);
