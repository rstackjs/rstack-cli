// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lint(({ js, ts, reactPlugin, reactHooksPlugin, rstestPlugin }) => [
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
  reactPlugin.configs.recommended,
  reactHooksPlugin.configs.recommended,
  {
    files: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    ...rstestPlugin.configs.recommended,
  },
  {
    languageOptions: {
      parserOptions: {
        project: [
          './apps/*/tsconfig.json',
          './apps/*/tests/tsconfig.json',
          './packages/*/tsconfig.json',
          './packages/*/tests/tsconfig.json',
        ],
      },
    },
  },
]);

define.fmt({
  singleQuote: true,
  ignorePatterns: ['**/dist/**', '**/.turbo/**'],
});
