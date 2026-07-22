import { expect, test } from 'rstack/test';

declare const RSTACK_INHERITED_CONFIG: string;

test('inherits the app config', () => {
  expect(RSTACK_INHERITED_CONFIG).toBe('app');
});
