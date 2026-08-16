import { expect, test } from 'rstack/test';
import { expectWriteSummary, setupFmtTest } from './helpers.ts';

const { readProjectFile, runFmt, writeProjectFile } = setupFmtTest();

test.each([
  {
    name: 'TypeScript',
    source:
      '<script setup lang="ts">\nconst title=ref<string>("Rstack + Vue")\n</script>\n',
    expected:
      '<script setup lang="ts">\nconst title = ref<string>("Rstack + Vue");\n</script>\n',
  },
  {
    name: 'TSX',
    source:
      '<script setup lang="tsx">\nconst view=<Component value={1}/>\n</script>\n',
    expected:
      '<script setup lang="tsx">\nconst view = <Component value={1} />;\n</script>\n',
  },
])('formats $name embedded in Vue files', ({ source, expected }) => {
  writeProjectFile('App.vue', source);

  const result = runFmt(['App.vue']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 1, 1);
  expect(result.stderr).toBe('');
  expect(readProjectFile('App.vue')).toBe(expected);
});
