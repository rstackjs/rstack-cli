import { define } from 'rstack';

declare global {
  // rslint-disable-next-line no-var
  var __rstackLoadConfigFreshCount: number | undefined;
}

globalThis.__rstackLoadConfigFreshCount = (globalThis.__rstackLoadConfigFreshCount ?? 0) + 1;

define.app({
  source: {
    define: {
      RSTACK_LOAD_COUNT: JSON.stringify(globalThis.__rstackLoadConfigFreshCount),
    },
  },
});
