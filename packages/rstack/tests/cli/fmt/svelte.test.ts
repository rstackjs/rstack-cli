import { expect, test } from 'rstack/test';
import { expectWriteSummary, setupFmtTest } from './helpers.ts';

const { readProjectFile, runFmt, writeProjectFile } = setupFmtTest();

test.each([
  {
    name: 'instance scripts',
    source:
      '<script lang="ts">\nlet title=$state<string>("Rstack + Svelte")\n</script>\n\n<h1>{title}</h1>\n',
    expected:
      '<script lang="ts">\n  let title = $state<string>("Rstack + Svelte");\n</script>\n\n<h1>{title}</h1>\n',
  },
  {
    name: 'module scripts',
    source:
      '<script module lang="ts">\nconst identity=<T>(value:T):T=>value\n</script>\n\n<p>{identity("Rstack")}</p>\n',
    expected:
      '<script module lang="ts">\n  const identity = <T,>(value: T): T => value;\n</script>\n\n<p>{identity("Rstack")}</p>\n',
  },
])('formats TypeScript embedded in Svelte $name', ({ source, expected }) => {
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from 'rstack';

define.fmt({ plugins: ['prettier-plugin-svelte'] });
`,
  );
  writeProjectFile('App.svelte', source);

  const result = runFmt(['App.svelte']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 1, 1);
  expect(result.stderr).toBe('');
  expect(readProjectFile('App.svelte')).toBe(expected);
});
