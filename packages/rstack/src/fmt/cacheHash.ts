import { hash } from 'node:crypto';

/** A 16-character base64url token preserves 96 bits of the SHA-256 digest. */
const cacheHashLength = 16;

const createCacheHash = (content: string | Uint8Array): string =>
  hash('sha256', content, 'base64url').slice(0, cacheHashLength);

const isCacheHash = (value: unknown): value is string =>
  typeof value === 'string' && value.length === cacheHashLength;

export { cacheHashLength, createCacheHash, isCacheHash };
