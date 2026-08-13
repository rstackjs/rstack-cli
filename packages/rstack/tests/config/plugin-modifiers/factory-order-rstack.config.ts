import { define } from 'rstack';

let setupComplete = false;

const assertSetupComplete = (): Record<string, never> => {
  if (!setupComplete) {
    throw new Error('plugin setup must run before config factories');
  }
  return {};
};

define.plugins([
  {
    name: 'factory-order',
    setup() {
      setupComplete = true;
    },
  },
]);

define.app(assertSetupComplete);
define.lib(assertSetupComplete);
define.doc(async () => assertSetupComplete());
define.test(assertSetupComplete);
define.lint(async () => [assertSetupComplete()]);
define.fmt(assertSetupComplete);
