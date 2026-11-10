import { define } from 'rstack';

type Context = { report: (descriptor: object) => void };

define.lint([
  {
    files: ['**/*.js'],
    plugins: {
      local: {
        rules: {
          'no-foo': {
            meta: { messages: { foo: 'foo is not allowed' } },
            create: (context: Context) => ({
              Identifier(node: { name: string }) {
                if (node.name === 'foo') {
                  context.report({ node, messageId: 'foo' });
                }
              },
            }),
          },
        },
      },
    },
    rules: { 'local/no-foo': 'error' },
  },
]);
