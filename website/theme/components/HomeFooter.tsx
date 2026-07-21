import { useI18n, useLang } from '@rspress/core/runtime';
import { Link } from '@rspress/core/theme-original';
import { memo } from 'react';
import styles from './HomeFooter.module.scss';

function useFooterData() {
  const t = useI18n<typeof import('i18n')>();
  const lang = useLang();
  const getLink = (link: string) => (lang === 'en' ? link : `/${lang}${link}`);

  return [
    {
      title: t('guide'),
      items: [
        {
          title: t('quickStart'),
          link: getLink('/guide/quick-start'),
        },
        {
          title: t('configuration'),
          link: getLink('/guide/configuration'),
        },
      ],
    },
    {
      title: t('commands'),
      items: [
        {
          title: 'rs build',
          link: getLink('/guide/cli/build'),
        },
        {
          title: 'rs lib',
          link: getLink('/guide/cli/lib'),
        },
        {
          title: 'rs test',
          link: getLink('/guide/cli/test'),
        },
        {
          title: 'rs lint',
          link: getLink('/guide/cli/lint'),
        },
        {
          title: 'rs doc',
          link: getLink('/guide/cli/doc'),
        },
      ],
    },
    {
      title: t('ecosystem'),
      items: [
        {
          title: 'Rsbuild',
          link: 'https://rsbuild.rs/',
        },
        {
          title: 'Rslib',
          link: 'https://rslib.rs/',
        },
        {
          title: 'Rstest',
          link: 'https://rstest.rs/',
        },
        {
          title: 'Rslint',
          link: 'https://rslint.rs/',
        },
        {
          title: 'Rspress',
          link: 'https://rspress.rs/',
        },
      ],
    },
    {
      title: t('community'),
      items: [
        {
          title: 'GitHub',
          link: 'https://github.com/rstackjs/rstack-cli',
        },
        {
          title: 'npm',
          link: 'https://www.npmjs.com/package/rstack',
        },
        {
          title: 'Discord',
          link: 'https://discord.gg/XsaKEEk4mW',
        },
      ],
    },
  ];
}

export const HomeFooter = memo(() => {
  const footerData = useFooterData();

  return (
    <div className={styles.footer}>
      <div className={styles.container}>
        {footerData.map((item) => (
          <div key={item.title} className={styles.column}>
            <h2>{item.title}</h2>
            <ul>
              {item.items.map((subItem) => (
                <li key={subItem.title}>
                  <Link href={subItem.link}>
                    <span className={styles.text}>{subItem.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
});
