import path from 'node:path';
import { afterEach, expect, test } from 'rstack/test';
import { getConfigState } from '../../../src/config.ts';

const state = getConfigState();

afterEach(() => {
  delete state.configPath;
});

test('initializes plugins before resolving the lint config factory', async () => {
  state.configPath = path.join(import.meta.dirname, 'factory-order-rstack.config.ts');

  await expect(import('../../../src/rslintConfig.ts')).resolves.toMatchObject({
    default: [{}],
  });
});
