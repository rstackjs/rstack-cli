import { define } from 'rstack';
import { defineInlineProject } from 'rstack/test';

let libConfigCalls = 0;

define.lib(() => {
  libConfigCalls += 1;

  return {
    lib: [{}],
    source: {
      define: {
        RSTACK_INHERITED_CONFIG: JSON.stringify('lib'),
        RSTACK_LIB_CONFIG_CALLS: JSON.stringify(libConfigCalls),
      },
    },
  };
});

define.test({
  projects: [
    defineInlineProject({
      name: 'lib-first',
      include: ['./first.ts'],
    }),
    defineInlineProject({
      name: 'lib-second',
      include: ['./second.ts'],
    }),
  ],
});
