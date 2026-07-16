import type { RsbuildConfig } from '@rsbuild/core';
import { define } from 'rstack';

declare global {
  // rslint-disable-next-line no-var
  var __rstackReusableAppConfig: RsbuildConfig | undefined;
}

define.app(() => globalThis.__rstackReusableAppConfig ?? {});
