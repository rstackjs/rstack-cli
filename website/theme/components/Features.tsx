import { useI18n } from '@rspress/core/runtime';
import { HomeFeature } from '@rspress/core/theme-original';
import { containerStyle, innerContainerStyle } from '@rstack-dev/doc-ui/section-style';
import './Features.module.scss';

export function Features() {
  const t = useI18n<typeof import('i18n')>();
  const features = [
    {
      title: t('unifiedCli'),
      details: t('unifiedCliDesc'),
      icon: '⌨️',
    },
    {
      title: t('oneConfig'),
      details: t('oneConfigDesc'),
      icon: '🧭',
    },
    {
      title: t('fullWorkflow'),
      details: t('fullWorkflowDesc'),
      icon: '🧰',
    },
    {
      title: t('ecosystemPowered'),
      details: t('ecosystemPoweredDesc'),
      icon: '⚡',
    },
    {
      title: t('workflowFriendly'),
      details: t('workflowFriendlyDesc'),
      icon: '🤝',
    },
    {
      title: t('composable'),
      details: t('composableDesc'),
      icon: '🧩',
    },
  ];

  return (
    <section className={containerStyle}>
      <div className={innerContainerStyle}>
        <HomeFeature features={features} />
      </div>
    </section>
  );
}
