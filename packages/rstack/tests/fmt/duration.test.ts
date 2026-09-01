import { expect, test } from 'rstack/test';
import { formatDuration } from '../../src/fmt/duration.ts';

test.each([
  [0, '<1ms'],
  [0.999, '<1ms'],
  [1, '1ms'],
  [29.6, '30ms'],
  [999.4, '999ms'],
  [999.6, '1s'],
  [1_390, '1.39s'],
  [1_234, '1.234s'],
  [60_000, '1m0s'],
  [60_123, '1m0.123s'],
  [3_661_234, '1h1m1.234s'],
] as const)('formats %sms as %s', (milliseconds, expected) => {
  expect(formatDuration(milliseconds)).toBe(expected);
});
