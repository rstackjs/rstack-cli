import { createRequire } from 'node:module';
import path from 'node:path';

export type NativeBinding = typeof import('../../binding.cjs');

const require = createRequire(import.meta.url);
export const loadNativeBinding = (): NativeBinding => {
  const packageJsonPath = require.resolve('rstack/package.json');
  return require(path.join(path.dirname(packageJsonPath), 'binding.cjs')) as NativeBinding;
};
