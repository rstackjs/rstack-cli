import { expect, test } from 'rstack/test';
import { loadNativeBinding } from '../../dist/native/index.js';

test('passes a string through the private loader and Rust', () => {
  expect(loadNativeBinding().nativePing('rstack')).toBe('pong:rstack');
});
