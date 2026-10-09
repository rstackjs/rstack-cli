import { define } from 'rstack';

const hooks = globalThis.__rstackConfigTestHooks!;

define.app({ root: 'first' });
hooks.ready.resolve();

await hooks.release.promise;

define.test({});
