import { define } from 'rstack';

let setupComplete = false;

const createConfig = () => {
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

define.app(createConfig);
define.lib(createConfig);
define.doc(() => Promise.resolve(createConfig()));
define.test(createConfig);
define.lint(() => [createConfig()]);
define.fmt(createConfig);
