// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app({
  html: {
    template: './src/index.html',
  },
  source: {
    decorators: {
      version: 'legacy',
    },
  },
});

define.lint(({ js, ts, rstestPlugin }) => [
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
  {
    files: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    ...rstestPlugin.configs.recommended,
  },
]);

define.fmt({
  singleQuote: true,
});
