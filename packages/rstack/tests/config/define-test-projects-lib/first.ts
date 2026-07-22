import { expect, test } from 'rstack/test';

declare const RSTACK_INHERITED_CONFIG: string;
declare const RSTACK_LIB_CONFIG_CALLS: number;

test('the first inline project inherits the lib config', () => {
  expect(RSTACK_INHERITED_CONFIG).toBe('lib');
  expect(RSTACK_LIB_CONFIG_CALLS).toBe(1);
});
