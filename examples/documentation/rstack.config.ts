import { define } from 'rstack';
import path from 'node:path';

define.doc({
  root: path.join(import.meta.dirname, 'docs'),
  title: 'My Site',
});

define.lint(async () => {
  const { js, ts, reactPlugin, reactHooksPlugin } = await import('@rslint/core');
  return [
    js.configs.recommended,
    ts.configs.recommended,
    reactPlugin.configs.recommended,
    reactHooksPlugin.configs.recommended,
  ];
});
