import { isAbsolute, join } from 'node:path';

/**
 * ensure absolute file path.
 * @param base - Base path to resolve relative from.
 * @param filePath - Absolute or relative file path.
 * @returns Resolved absolute file path.
 */
export const ensureAbsolutePath = (base: string, filePath: string): string =>
  isAbsolute(filePath) ? filePath : join(base, filePath);
