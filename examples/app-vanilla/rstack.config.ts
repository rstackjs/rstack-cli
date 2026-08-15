// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.test({
  testEnvironment: 'happy-dom',
  setupFiles: ['./tests/rstest.setup.ts'],
});

define.lint(({ js, ts }) => [js.configs.recommended, ts.configs.recommended]);
