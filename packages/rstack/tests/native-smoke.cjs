const assert = require('node:assert/strict');
const test = require('node:test');

const { nativePing } = require('../binding.cjs');

test('passes a string from JavaScript through Rust and back', () => {
  assert.equal(nativePing('rstack'), 'pong:rstack');
});
