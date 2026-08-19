// Configuration guide: https://rstack.rs/config
import path from 'node:path';
import { define } from 'rstack';

define.doc({
  root: path.join(import.meta.dirname, 'docs'),
  title: 'My Site',
  description: 'A multilingual Rspress documentation site.',
  lang: 'en',
  locales: [
    {
      lang: 'en',
      label: 'English',
      title: 'My Site',
      description: 'A multilingual Rspress documentation site.',
    },
    {
      lang: 'zh',
      label: '简体中文',
      title: '我的站点',
      description: '一个多语言 Rspress 文档站点。',
    },
  ],
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
