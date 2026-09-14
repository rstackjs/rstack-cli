import { useLang } from '@rspress/core/runtime';
import { Link } from '@rspress/core/theme-original';
import { useEffect, useState } from 'react';
import { useI18nUrl } from './utils';
import styles from './GetStarted.module.scss';

const command = 'pnpm create rstack@latest';

export function GetStarted() {
  const isZh = useLang() === 'zh';
  const tUrl = useI18nUrl();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  );

  useEffect(() => {
    if (copyStatus === 'idle') return;
    const timeout = setTimeout(() => setCopyStatus('idle'), 2500);
    return () => clearTimeout(timeout);
  }, [copyStatus]);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  }

  return (
    <section className={styles.getStarted} aria-labelledby="get-started-title">
      <div className={styles.inner}>
        <h2 id="get-started-title">
          {isZh
            ? '用 Rstack CLI 开启下一个项目'
            : 'Build your next project with Rstack CLI'}
        </h2>
        <p className={styles.description}>
          {isZh
            ? '让工具步调一致，将时间留给你想创造的事物'
            : 'Keep your tools in sync and make time for what you want to create.'}
        </p>
        <div className={styles.controls}>
          <div className={styles.actions}>
            <div className={styles.command}>
              <span className={styles.prompt} aria-hidden="true">
                $
              </span>
              <code>{command}</code>
              <button
                type="button"
                className={styles.copyButton}
                onClick={() => {
                  void copyCommand();
                }}
                aria-label={isZh ? '复制创建命令' : 'Copy create command'}
                title={isZh ? '复制命令' : 'Copy command'}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {copyStatus === 'copied' ? (
                    <path d="m5 12 4 4L19 6" />
                  ) : (
                    <>
                      <rect x="8" y="8" width="12" height="13" rx="2" />
                      <path d="M16 4V3H4v13h1" />
                    </>
                  )}
                </svg>
              </button>
            </div>
            <Link className={styles.primary} href={tUrl('/guide/quick-start')}>
              {isZh ? '开始使用' : 'Get started'}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </Link>
          </div>
          <p className={styles.status} role="status" aria-live="polite">
            {copyStatus === 'copied'
              ? isZh
                ? '命令已复制'
                : 'Command copied'
              : copyStatus === 'error'
                ? isZh
                  ? '复制失败，请手动复制命令'
                  : 'Could not copy. Please copy the command manually.'
                : ''}
          </p>
        </div>
      </div>
    </section>
  );
}
