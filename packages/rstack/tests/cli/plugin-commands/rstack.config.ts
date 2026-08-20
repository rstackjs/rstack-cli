import { define } from 'rstack';

define.plugins([
  {
    name: 'plugin-command-fixture',
    setup({ addCommand, context }) {
      addCommand({
        name: 'plugin-command',
        handler(args) {
          console.log(JSON.stringify({ args, context }));
        },
      });
      addCommand({
        name: 'async-command',
        async handler() {
          await Promise.resolve();
          console.log('async handler completed');
        },
      });
      addCommand({
        name: 'throws-command',
        handler() {
          throw new Error('plugin command failure');
        },
      });
    },
  },
]);
