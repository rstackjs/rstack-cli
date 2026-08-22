import path from 'node:path';
import { expect, test } from 'rstack/test';
import { loadNativeBinding } from '../../src/native/index.ts';

const rootPath = path.join(import.meta.dirname, 'project');

const createMatcher = () =>
  new (loadNativeBinding().IgnoreMatcher)([
    {
      rootPath,
      patterns: '*.js\n!keep.js\ndist/',
    },
    {
      rootPath,
      patterns: 'keep.js',
    },
  ]);

test('matches selected config ignore entries in native batches', () => {
  const matcher = createMatcher();
  const names = ['drop.js', 'keep.js', 'keep.ts', 'dist', 'skipped.js'];

  expect(
    Array.from(
      matcher.isIgnoredBatch(
        rootPath,
        names,
        new Uint8Array([0, 0, 0, 1, 0]),
        new Uint8Array([1, 1, 1, 1, 0]),
      ),
    ),
  ).toEqual([1, 1, 0, 1, 0]);
  expect(matcher.isIgnoredBatchMask(rootPath, names, 0b01000, 0b01111)).toBe(
    0b01011,
  );
  expect(matcher.isIgnoredChild(rootPath, 'drop.js', false)).toBe(true);
  expect(matcher.isIgnoredChild(rootPath, 'keep.ts', false)).toBe(false);
});

test('preserves the high bit in native config ignore batch masks', () => {
  const matcher = createMatcher();
  const names = Array.from({ length: 32 }, (_, index) => `${index}.ts`);
  names[31] = 'drop.js';

  expect(matcher.isIgnoredBatchMask(rootPath, names, 0, 0x80000000)).toBe(
    0x80000000,
  );
});

test('validates native config ignore batch inputs', () => {
  const matcher = createMatcher();

  expect(() =>
    matcher.isIgnoredBatch(
      rootPath,
      ['index.js'],
      new Uint8Array(),
      new Uint8Array([1]),
    ),
  ).toThrow('Name and directory flag counts must match.');
  expect(() =>
    matcher.isIgnoredBatch(
      rootPath,
      ['index.js'],
      new Uint8Array([0]),
      new Uint8Array(),
    ),
  ).toThrow('Name and candidate flag counts must match.');
  expect(() =>
    matcher.isIgnoredBatchMask(
      rootPath,
      Array.from({ length: 33 }, (_, index) => `${index}.js`),
      0,
      0xffffffff,
    ),
  ).toThrow('A bit-mask batch cannot contain more than 32 names.');
});
