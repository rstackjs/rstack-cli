import path from 'node:path';
import { define } from 'rstack';

const title = 'Rstack CLI';
const description =
  'Rstack CLI brings the Rstack toolchain together with one CLI, one configuration, and one consistent workflow.';
const descriptionZh = 'Rstack CLI 通过统一的命令行、配置和工作流整合 Rstack 工具链。';

define.doc(async () => {
  const { pluginSass } = await import('@rsbuild/plugin-sass');
  const { transformerNotationDiff, transformerNotationFocus, transformerNotationHighlight } =
    await import('@shikijs/transformers');
  const { pluginSitemap } = await import('@rspress/plugin-sitemap');
  const { pluginOpenGraph } = await import('rsbuild-plugin-open-graph');
  const { pluginFontOpenSans } = await import('rspress-plugin-font-open-sans');
  const siteUrl = 'https://rstack.rs';

  return {
    root: path.join(import.meta.dirname, 'docs'),
    title,
    icon: 'https://assets.rspack.rs/rspack/favicon-128x128.png',
    logoText: title,
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
    plugins: [pluginFontOpenSans(), pluginSitemap({ siteUrl })],
    themeConfig: {
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
        docRepoBaseUrl: 'https://github.com/rstackjs/rstack-cli/tree/main/website/docs',
      },
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
  };
});
