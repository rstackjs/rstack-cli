import styles from './Copyright.module.scss';

export const CopyRight = () => {
  return (
    <p className={styles.copyRight}>
      © 2026 Rstack contributors ·{' '}
      <a
        href="https://github.com/rstackjs/rstack-cli/blob/main/LICENSE"
        target="_blank"
        rel="noopener noreferrer"
      >
        MIT License
      </a>
    </p>
  );
};
