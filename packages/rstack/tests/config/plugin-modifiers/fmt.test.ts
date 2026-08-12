import { expect, test } from 'rstack/test';
import { setupFmtTest } from '../../cli/fmt/helpers.ts';

const { readProjectFile, runFmt, writeProjectFile } = setupFmtTest();

test('applies fmt modifiers after resolving the native config definition', () => {
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from 'rstack';

define.plugins([
  {
    name: 'fmt-modifier',
    setup({ modifyConfig }) {
      modifyConfig('fmt', async (config) => ({ ...config, singleQuote: true }));
    },
  },
]);

define.fmt(() => ({}));
`,
  );
  writeProjectFile('index.ts', 'const message="hello"');

  const result = runFmt(['index.ts']);

  expect(result.status).toBe(0);
  expect(readProjectFile('index.ts')).toBe("const message = 'hello';\n");
});
