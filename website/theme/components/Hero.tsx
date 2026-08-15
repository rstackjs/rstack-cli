import { useI18n } from '@rspress/core/runtime';
import {
  IconArrowRight,
  IconCopy,
  IconSuccess,
  Link,
  SvgWrapper,
  copyToClipboard,
} from '@rspress/core/theme-original';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18nUrl } from './utils';
import styles from './Hero.module.scss';

const createCommand = 'pnpm create rstack';
const githubUrl = 'https://github.com/rstackjs/rstack-cli';

export function Hero() {
  const tUrl = useI18nUrl();
  const t = useI18n<typeof import('i18n')>();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);

  const handleCopy = useCallback(async () => {
    const copiedSuccessfully = await copyToClipboard(createCommand);

    if (!copiedSuccessfully) {
      return;
    }

    setCopied(true);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), 1600);
  }, []);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  return (
    <section className={styles.hero} aria-labelledby="home-hero-title">
      <div className={styles.inner}>
        <h1 id="home-hero-title" className={styles.title}>
          <span>{t('title')}</span>
          <span className={styles.subtitle}>{t('subtitle')}</span>
        </h1>

        <p className={styles.description}>{t('slogan')}</p>

        <div className={styles.command}>
          <span className={styles.prompt} aria-hidden="true">
            $
          </span>
          <code>{createCommand}</code>
          <button
            type="button"
            className={styles.copyButton}
            aria-label={copied ? t('copiedCommand') : t('copyCommand')}
            title={copied ? t('copiedCommand') : t('copyCommand')}
            onClick={() => void handleCopy()}
          >
            <SvgWrapper icon={copied ? IconSuccess : IconCopy} />
          </button>
        </div>

        <div className={styles.links}>
          <Link className={styles.link} href={tUrl('/guide/quick-start')}>
            <span>{t('quickStart')}</span>
            <SvgWrapper icon={IconArrowRight} />
          </Link>
          <a className={styles.link} href={githubUrl} target="_blank" rel="noopener noreferrer">
            <span>{t('viewSource')}</span>
            <SvgWrapper icon={IconArrowRight} />
          </a>
        </div>
      </div>
    </section>
  );
}
