import { decode } from '@swc-next/decoder';
import { expect, test } from 'rstack/test';
import { loadNativeBinding } from '../../src/native/index.ts';

test('decodes owned native buffers and UTF-16 diagnostics across repeated parses', () => {
  const binding = loadNativeBinding();
  const validSource = '// 中文 😀\nconst value = 1;';
  const validBuffer = binding.parseSwcNext(validSource, 'ts', 'module');
  const invalidSource = 'const text = "😀"; const = 1;';
  const invalidBuffer = binding.parseSwcNext(invalidSource, 'ts', 'module');

  expect(Buffer.isBuffer(validBuffer)).toBe(true);
  const valid = decode(validBuffer, validSource);
  expect(valid.diagnostics).toEqual([]);
  expect(valid.comments).toEqual([
    { type: 'Line', value: ' 中文 😀', start: 0, end: 8 },
  ]);
  const invalid = decode(invalidBuffer, invalidSource);
  expect(invalid.diagnostics[0].start).toBe(invalidSource.lastIndexOf('='));
  expect(invalid.diagnostics[0].end).toBe(invalidSource.lastIndexOf('=') + 1);
});

test('rejects unsupported native parser options', () => {
  const binding = loadNativeBinding();
  expect(() => binding.parseSwcNext('', 'unknown', 'module')).toThrow(
    'Unsupported SWC Next language.',
  );
  expect(() => binding.parseSwcNext('', 'ts', 'unknown')).toThrow(
    'Unsupported SWC Next source type.',
  );
});
