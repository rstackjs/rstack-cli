import { define } from 'rstack';
import { defineInlineProject } from 'rstack/test';

let appConfigCalls = 0;

define.app(() => {
  appConfigCalls += 1;

  return {
    source: {
      define: {
        RSTACK_APP_CONFIG_CALLS: JSON.stringify(appConfigCalls),
        RSTACK_INHERITED_CONFIG: JSON.stringify('app'),
      },
    },
  };
});

define.test({
  projects: [
    defineInlineProject({
      name: 'app-first',
      include: ['./first.ts'],
    }),
    defineInlineProject({
      name: 'app-second',
      include: ['./second.ts'],
    }),
    defineInlineProject({
      name: 'custom-extends',
      include: ['./custom.ts'],
      extends: {
        source: {
          define: {
            RSTACK_INHERITED_CONFIG: JSON.stringify('custom'),
          },
        },
      },
    }),
  ],
});
