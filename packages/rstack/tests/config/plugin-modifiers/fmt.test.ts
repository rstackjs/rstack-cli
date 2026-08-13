import { expect, test } from 'rstack/test';
import { setupFmtTest } from '../../cli/fmt/helpers.ts';

const { readProjectFile, runFmt, writeProjectFile } = setupFmtTest();

test('applies fmt modifiers after resolving the native config definition', () => {
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from 'rstack';

let setupComplete = false;

define.plugins([
  {
    name: 'fmt-modifier',
    setup({ modifyConfig }) {
      setupComplete = true;
      modifyConfig('fmt', async (config) => ({ ...config, singleQuote: true }));
    },
  },
]);

define.fmt(() => {
  if (!setupComplete) {
    throw new Error('plugin setup must run before config factories');
  }
  return {};
});
`,
  );
  writeProjectFile('index.ts', 'const message="hello"');

  const result = runFmt(['index.ts']);

  expect(result.status).toBe(0);
  expect(readProjectFile('index.ts')).toBe("const message = 'hello';\n");
});
