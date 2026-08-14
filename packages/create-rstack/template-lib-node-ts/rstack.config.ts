// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib({
  syntax: ['node 22'],
  dts: true,
});

define.lint(({ js, ts }) => [
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
]);

define.fmt({
  singleQuote: true,
});
