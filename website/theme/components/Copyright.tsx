import styles from './Copyright.module.scss';

export const CopyRight = () => {
  return (
    <footer className={styles.copyRight}>
      <div className={styles.copyRightInner}>
        <div className={styles.copyRightText}>
          <p>Rstack CLI is free and open source software released under the MIT license.</p>
          <p>© 2026 Rstack contributors.</p>
        </div>
      </div>
    </footer>
  );
};
