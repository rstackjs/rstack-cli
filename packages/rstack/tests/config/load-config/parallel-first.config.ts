import { define } from 'rstack';

define.extends([{ fmt: { semi: false } }]);

const hooks = globalThis.__rstackConfigTestHooks!;

define.app({ root: 'first' });
hooks.ready.resolve();

await hooks.release.promise;

define.test({});
