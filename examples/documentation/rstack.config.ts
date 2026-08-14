// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';
import path from 'node:path';

define.doc({
  root: path.join(import.meta.dirname, 'docs'),
  title: 'My Site',
});

define.lint(({ js, ts, reactPlugin, reactHooksPlugin }) => [
  js.configs.recommended,
  ts.configs.recommended,
  reactPlugin.configs.recommended,
  reactHooksPlugin.configs.recommended,
]);
