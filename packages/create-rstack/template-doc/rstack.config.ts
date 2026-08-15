// Configuration guide: https://rstack.rs/config
import path from 'node:path';
import { define } from 'rstack';

define.doc({
  root: path.join(import.meta.dirname, 'docs'),
  title: 'My Site',
});

define.lint(({ js, ts, reactPlugin, reactHooksPlugin }) => [
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
  reactPlugin.configs.recommended,
  reactHooksPlugin.configs.recommended,
]);

define.fmt({
  singleQuote: true,
});
