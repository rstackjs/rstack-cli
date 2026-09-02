// Configuration guide: https://rstack.rs/config
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginClientRedirects } from '@rspress/plugin-client-redirects';
import { pluginSitemap } from '@rspress/plugin-sitemap';
import {
  transformerNotationDiff,
  transformerNotationFocus,
  transformerNotationHighlight,
} from '@shikijs/transformers';
import path from 'node:path';
import { define } from 'rstack';
import { pluginOpenGraph } from 'rsbuild-plugin-open-graph';
import { pluginFontOpenSans } from 'rspress-plugin-font-open-sans';

const title = 'Rstack CLI';
const description =
  'Rstack CLI brings the Rstack toolchain together with one CLI, one configuration, and one consistent workflow.';
const descriptionZh =
  'Rstack CLI 通过统一的命令行、配置和工作流整合 Rstack 工具链。';
const injectLlmsHint = process.env.RSPRESS_INJECT_LLMS_HINT !== 'false';

const siteUrl = 'https://rstack.rs';

define.doc({
  root: path.join(import.meta.dirname, 'docs'),
  title,
  icon: 'https://assets.rspack.rs/rspack/rspack-claw-logo.svg',
  logo: '/horizontal-logo.svg',
  description,
  lang: 'en',
  llms: true,
  search: {
    codeBlocks: true,
  },
  markdown: {
    link: {
      checkAnchors: true,
      checkDeadLinks: true,
    },
    shiki: {
      transformers: [
        transformerNotationDiff(),
        transformerNotationHighlight(),
        transformerNotationFocus(),
      ],
    },
  },
  route: {
    cleanUrls: true,
  },
  plugins: [
    pluginClientRedirects({
      redirects: [
        {
          from: '^/config/?$',
          to: '/guide/configuration',
        },
      ],
    }),
    pluginFontOpenSans(),
    pluginSitemap({ siteUrl }),
  ],
  locales: [
    {
      lang: 'en',
      label: 'English',
      title,
      description,
    },
    {
      lang: 'zh',
      label: '简体中文',
      title,
      description: descriptionZh,
    },
  ],
  themeConfig: {
    llmsUI: {
      placement: 'outline',
      injectLlmsHint,
    },
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/rstackjs/rstack-cli',
      },
      {
        icon: 'discord',
        mode: 'link',
        content: 'https://discord.gg/XsaKEEk4mW',
      },
    ],
    editLink: {
      docRepoBaseUrl:
        'https://github.com/rstackjs/rstack-cli/tree/main/website/docs',
    },
  },
  builderConfig: {
    plugins: [
      pluginSass(),
      pluginOpenGraph({
        title,
        type: 'website',
        url: siteUrl,
        description,
      }),
    ],
    server: {
      open: true,
    },
    tools: {
      rspack: {
        experiments: {
          nativeWatcher: true,
        },
      },
    },
  },
});
