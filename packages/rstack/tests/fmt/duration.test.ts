import { expect, test } from 'rstack/test';
import { formatDuration } from '../../src/fmt/duration.ts';

test.each([
  [0, '<1ms'],
  [0.999, '<1ms'],
  [1, '1ms'],
  [29.6, '30ms'],
  [999.4, '999ms'],
  [999.6, '1.00s'],
  [1_390, '1.39s'],
  [1_234, '1.23s'],
  [12_340, '12.3s'],
  [60_000, '1m'],
  [60_123, '1m 0.1s'],
  [3_661_234, '61m 1.2s'],
] as const)('formats %sms as %s', (milliseconds, expected) => {
  expect(formatDuration(milliseconds)).toBe(expected);
});
