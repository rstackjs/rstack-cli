import { useI18n } from '@rspress/core/runtime';
import { Link } from '@rspress/core/theme-original';
import { containerStyle, innerContainerStyle } from '@rstack-dev/doc-ui/section-style';
import { type Feature, WhyRspack as BaseFeatures } from '@rstack-dev/doc-ui/why-rspack';
import { memo, useMemo } from 'react';
import CompatibleJson from './Features/assets/Compatible.json';
import Compatible from './Features/assets/Compatible.svg';
import FrameCheckJson from './Features/assets/FrameCheck.json';
import FrameCheck from './Features/assets/FrameCheck.svg';
import LightningJson from './Features/assets/Lightning.json';
import Lightning from './Features/assets/Lightning.svg';
import SpeedometerJson from './Features/assets/Speedometer.json';
import Speedometer from './Features/assets/Speedometer.svg';
import { useI18nUrl } from './utils';

export const Features = memo(() => {
  const t = useI18n<typeof import('i18n')>();
  const tUrl = useI18nUrl();
  const features: Feature[] = useMemo(
    () => [
      {
        img: Speedometer,
        url: tUrl('/guide/quick-start#cli-commands'),
        title: t('unifiedCli'),
        description: t('unifiedCliDesc'),
        lottieJsonData: SpeedometerJson,
      },
      {
        img: Lightning,
        url: tUrl('/guide/configuration'),
        title: t('oneConfig'),
        description: t('oneConfigDesc'),
        lottieJsonData: LightningJson,
      },
      {
        img: FrameCheck,
        url: tUrl('/guide/configuration'),
        title: t('ecosystemPowered'),
        description: t('ecosystemPoweredDesc'),
        lottieJsonData: FrameCheckJson,
      },
      {
        img: Compatible,
        url: tUrl('/guide/quick-start'),
        title: t('workflowFriendly'),
        description: t('workflowFriendlyDesc'),
        lottieJsonData: CompatibleJson,
      },
    ],
    [t, tUrl],
  );

  return (
    <section className={containerStyle}>
      <div className={innerContainerStyle}>
        <BaseFeatures features={features} LinkComp={Link} />
      </div>
    </section>
  );
});
