// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib({
  syntax: ['node 22'],
  dts: true,
});

define.lint(({ js, ts, rstestPlugin }) => [
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
  {
    files: ['**/*.test.{ts,tsx}'],
    ...rstestPlugin.configs.recommended,
  },
]);

define.fmt({
  singleQuote: true,
});
