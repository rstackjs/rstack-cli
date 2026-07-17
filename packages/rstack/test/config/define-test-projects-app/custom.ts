import { expect, test } from 'rstack/test';

declare const RSTACK_INHERITED_CONFIG: string;

test('an inline project can provide its own extends config', () => {
  expect(RSTACK_INHERITED_CONFIG).toBe('custom');
});
