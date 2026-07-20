import { useI18n, useNavigate } from '@rspress/core/runtime';
import { Hero as BaseHero } from '@rstack-dev/doc-ui/hero';
import { useI18nUrl } from './utils';
import './Hero.module.scss';

export function Hero() {
  const navigate = useNavigate();
  const tUrl = useI18nUrl();
  const t = useI18n<typeof import('i18n')>();

  return (
    <BaseHero
      showStars
      onClickGetStarted={() => navigate(tUrl('/guide/quick-start'))}
      title="Rstack CLI"
      subTitle={t('subtitle')}
      description={t('slogan')}
      getStartedButtonText={t('quickStart')}
      githubURL="https://github.com/rstackjs/rstack-cli"
    />
  );
}
