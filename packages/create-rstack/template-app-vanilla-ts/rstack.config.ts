// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app({
  // Configure Rsbuild
});

define.test({
  setupFiles: ['./tests/rstest.setup.ts'],
});

define.lint(({ js, ts }) => [
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
]);

define.fmt({
  singleQuote: true,
});
