import assert from 'node:assert/strict';
import path from 'node:path';
import { loadRstackConfig } from '../../../src/config.ts';

type Deferred = ReturnType<typeof Promise.withResolvers<void>>;

declare global {
  // rslint-disable-next-line no-var
  var __rstackConfigTestHooks:
    { ready: Deferred; release: Deferred } | undefined;
}

const hooks = (globalThis.__rstackConfigTestHooks = {
  ready: Promise.withResolvers<void>(),
  release: Promise.withResolvers<void>(),
});
const load = (name: string) =>
  loadRstackConfig({ configFilePath: path.join(import.meta.dirname, name) });
const firstLoad = load('parallel-first.config.ts');
await Promise.race([hooks.ready.promise, firstLoad]);

if (process.argv[2] === 'failure') {
  await assert.rejects(load('parallel-failing.config.ts'), {
    message: 'parallel config error',
  });
  hooks.release.resolve();
  console.log(JSON.stringify((await firstLoad).configs));
} else {
  const secondLoad = load('parallel-second.config.ts');
  const parallelLoads = Promise.all([firstLoad, secondLoad]);
  await secondLoad;
  hooks.release.resolve();
  console.log(
    JSON.stringify((await parallelLoads).map(({ configs }) => configs)),
  );
}
