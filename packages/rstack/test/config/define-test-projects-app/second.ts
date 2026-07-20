import { expect, test } from 'rstack/test';

declare const RSTACK_APP_CONFIG_CALLS: number;
declare const RSTACK_INHERITED_CONFIG: string;

test('the second inline project inherits the app config', () => {
  expect(RSTACK_INHERITED_CONFIG).toBe('app');
  expect(RSTACK_APP_CONFIG_CALLS).toBe(1);
});
