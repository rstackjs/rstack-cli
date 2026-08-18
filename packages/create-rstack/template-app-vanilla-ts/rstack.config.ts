// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app({
  // Configure Rsbuild
});

define.test({
  setupFiles: ['./tests/rstest.setup.ts'],
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
