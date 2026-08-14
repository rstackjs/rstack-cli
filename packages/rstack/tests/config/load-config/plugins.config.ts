import { define } from 'rstack';

define.plugins([
  { name: 'first', setup() {} },
  Promise.resolve({ name: 'second', setup() {} }),
  Promise.resolve([false, { name: 'third', setup() {} }]),
]);
