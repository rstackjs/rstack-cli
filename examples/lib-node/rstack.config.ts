// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib({
  dts: true,
  syntax: ['node 22'],
});

define.lint(({ js, ts }) => [js.configs.recommended, ts.configs.recommended]);
