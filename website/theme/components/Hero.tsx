import { useI18n } from '@rspress/core/runtime';
import { Link } from '@rspress/core/theme-original';
import rstackPackage from 'rstack/package.json';
import { useI18nUrl } from './utils';
import styles from './Hero.module.scss';

const githubUrl = 'https://github.com/rstackjs/rstack-cli';
const releasesUrl = `${githubUrl}/releases`;

function ReleaseLink() {
  return (
    <a
      className={styles.releaseLink}
      href={releasesUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      Latest release v{rstackPackage.version}
    </a>
  );
}

export function Hero() {
  const tUrl = useI18nUrl();
  const t = useI18n<typeof import('i18n')>();

  return (
    <section className={styles.hero} aria-labelledby="home-hero-title">
      <div className={styles.inner}>
        <ReleaseLink />

        <h1 id="home-hero-title" className={styles.title}>
          <span>{t('title')}</span>
          <span className={styles.subtitle}>{t('subtitle')}</span>
        </h1>

        <p className={styles.description}>{t('slogan')}</p>

        <div className={styles.links}>
          <Link
            className={`${styles.link} ${styles.primaryLink}`}
            href={tUrl('/guide/quick-start')}
          >
            {t('getStarted')}
          </Link>
          <a
            className={`${styles.link} ${styles.secondaryLink}`}
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('github')}
          </a>
        </div>
      </div>
    </section>
  );
}
