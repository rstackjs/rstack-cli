import { useI18n } from '@rspress/core/runtime';
import { Link } from '@rspress/core/theme-original';
import type { ReactNode } from 'react';
import { useI18nUrl } from './utils';
import styles from './Commands.module.scss';

function Terminal({ children }: { children: ReactNode }) {
  return (
    <figure className={styles.terminal}>
      <pre className={styles.output} tabIndex={0}>
        <code>{children}</code>
      </pre>
    </figure>
  );
}

function Prompt({ children }: { children: string }) {
  return (
    <span className={styles.command}>
      <span className={styles.dim}>$ </span>
      {children}
    </span>
  );
}

function CommandLinks({ commands }: { commands: string[] }) {
  const tUrl = useI18nUrl();

  return (
    <p className={styles.eyebrow}>
      {commands.map((command, index) => (
        <span className={styles.commandLinkGroup} key={command}>
          {index > 0 && <span aria-hidden="true">/</span>}
          <Link href={tUrl(`/guide/cli/${command}`)}>rs {command}</Link>
        </span>
      ))}
    </p>
  );
}

function LogLabel({ children }: { children: string }) {
  const color =
    children === 'info' || children === 'start'
      ? styles.accent
      : styles.success;
  return <span className={`${color} ${styles.bold}`}>{children}</span>;
}

function FilePath({
  path,
  dimDirectory = true,
}: {
  path: string;
  dimDirectory?: boolean;
}) {
  const split = path.lastIndexOf('/') + 1;
  return (
    <>
      <span className={dimDirectory ? styles.dim : styles.muted}>
        {path.slice(0, split)}
      </span>
      <span className={path.endsWith('.html') ? styles.success : styles.path}>
        {path.slice(split)}
      </span>
    </>
  );
}

function OutputFiles({
  format,
  files,
  total = false,
}: {
  format: string;
  files: { path: string; size: number; gzip?: number }[];
  total?: boolean;
}) {
  const pathWidth =
    Math.max(
      `File (${format})`.length,
      ...files.map((file) => file.path.length),
    ) + 2;
  const hasGzip = files.every((file) => file.gzip !== undefined);
  const sizeText = (size: number) => `${size.toFixed(2)} kB`.padStart(9);

  return (
    <>
      <span className={styles.tableHeader}>
        {`File (${format})`.padEnd(pathWidth)}
        {'Size'.padStart(9)}
        {hasGzip && 'Gzip'.padStart(9)}
      </span>
      {files.map((file) => (
        <span key={file.path}>
          {'\n'}
          <FilePath path={file.path} />
          {' '.repeat(pathWidth - file.path.length)}
          {sizeText(file.size)}
          {hasGzip && sizeText(file.gzip!)}
        </span>
      ))}
      {total && (
        <>
          {'\n\n'}
          <span className={styles.total}>{'Total:'.padStart(pathWidth)}</span>
          {sizeText(files.reduce((sum, file) => sum + file.size, 0))}
          {hasGzip &&
            sizeText(files.reduce((sum, file) => sum + file.gzip!, 0))}
        </>
      )}
    </>
  );
}

// Based on captured CLI output. Omit hashes and secondary logs, normalize
// version labels, and calculate totals from the files included in the example.
// Preserve the captured ANSI styles: uncolored numbers, bold build durations,
// blue table headers, magenta totals, gray test metadata, and dim directories.
export function Commands() {
  const t = useI18n<typeof import('i18n')>();

  return (
    <div className={styles.commands}>
      <section className={styles.section} aria-labelledby="commands-app-title">
        <div className={styles.copy}>
          <CommandLinks commands={['dev', 'build']} />
          <h2 id="commands-app-title">{t('appCommandTitle')}</h2>
          <p className={styles.description}>{t('appCommandDesc')}</p>
          <ul className={styles.highlights}>
            <li>{t('appCommandHmr')}</li>
            <li>{t('appCommandProduction')}</li>
            <li>{t('appCommandConfig')}</li>
          </ul>
        </div>
        <Terminal>
          <Prompt>rs build</Prompt>
          {'\n'}
          <span className={styles.tool}>Rsbuild v2.0.0</span>
          {'\n\n'}
          <LogLabel>info</LogLabel>
          {'    build started...\n'}
          <LogLabel>ready</LogLabel>
          {'   built in '}
          <span className={styles.bold}>0.02s</span>
          {'\n\n'}
          <OutputFiles
            format="web"
            files={[
              { path: 'dist/static/js/index.js', size: 0.2, gzip: 0.18 },
              { path: 'dist/index.html', size: 0.32, gzip: 0.24 },
            ]}
            total
          />
        </Terminal>
      </section>

      <section className={styles.section} aria-labelledby="commands-lib-title">
        <div className={styles.copy}>
          <CommandLinks commands={['lib']} />
          <h2 id="commands-lib-title">{t('libCommandTitle')}</h2>
          <p className={styles.description}>{t('libCommandDesc')}</p>
          <ul className={styles.highlights}>
            <li>{t('libCommandFormats')}</li>
            <li>{t('libCommandModes')}</li>
            <li>{t('libCommandTypes')}</li>
          </ul>
        </div>
        <Terminal>
          <Prompt>rs lib --dts</Prompt>
          {'\n'}
          <span className={styles.tool}>Rslib v1.0.0</span>
          {'\n\n'}
          <LogLabel>info</LogLabel>
          {'    build started...\n'}
          <LogLabel>ready</LogLabel>
          {'   built in '}
          <span className={styles.bold}>0.02s</span>
          {'\n'}
          <LogLabel>start</LogLabel>
          {'   generating declaration files...\n'}
          <LogLabel>ready</LogLabel>
          {'   declaration files generated\n\n'}
          <OutputFiles
            format="esm"
            files={[{ path: 'dist/index.js', size: 0.04 }]}
          />
        </Terminal>
      </section>
      <section className={styles.section} aria-labelledby="commands-test-title">
        <div className={styles.copy}>
          <CommandLinks commands={['test']} />
          <h2 id="commands-test-title">{t('testCommandTitle')}</h2>
          <p className={styles.description}>{t('testCommandDesc')}</p>
          <ul className={styles.highlights}>
            <li>{t('testCommandApi')}</li>
            <li>{t('testCommandPerformance')}</li>
            <li>{t('testCommandConfig')}</li>
          </ul>
        </div>
        <Terminal>
          <Prompt>rs test</Prompt>
          {'\n'}
          <span className={styles.tool}>Rstest v0.11.0</span>
          {'\n\n'}
          <span className={`${styles.success} ${styles.bold}`}> ✓ </span>
          <FilePath path="src/utils.test.ts" dimDirectory={false} />
          <span className={styles.muted}> (2)</span>
          {'\n'}
          <span className={`${styles.success} ${styles.bold}`}> ✓ </span>
          <FilePath path="src/app.test.ts" dimDirectory={false} />
          <span className={styles.muted}> (1)</span>
          {'\n\n'}
          <span className={styles.muted}>{' Test Files  '}</span>
          <span className={`${styles.success} ${styles.bold}`}>2 passed</span>
          {'\n'}
          <span className={styles.muted}>{'      Tests  '}</span>
          <span className={`${styles.success} ${styles.bold}`}>3 passed</span>
          {'\n'}
          <span className={styles.muted}>{'   Duration  '}</span>
          {'211ms'}
        </Terminal>
      </section>

      <section
        className={styles.section}
        aria-labelledby="commands-check-title"
      >
        <div className={styles.copy}>
          <CommandLinks commands={['lint', 'fmt', 'check']} />
          <h2 id="commands-check-title">{t('checkCommandTitle')}</h2>
          <p className={styles.description}>{t('checkCommandDesc')}</p>
          <ul className={styles.highlights}>
            <li>{t('checkCommandTypes')}</li>
            <li>{t('checkCommandFormat')}</li>
            <li>{t('checkCommandFix')}</li>
          </ul>
        </div>
        <Terminal>
          <Prompt>rs check</Prompt>
          {'\n\n'}
          <LogLabel>start</LogLabel>
          {'   Linting...\n'}
          <LogLabel>success</LogLabel>
          {' Lint passed in '}
          {'287ms'}
          {'\n\n'}
          <LogLabel>start</LogLabel>
          {'   Checking formatting...\n'}
          <LogLabel>success</LogLabel>
          {' Format check passed in '}
          {'25ms'}
          <span className={styles.dim}> (7 files)</span>
        </Terminal>
      </section>

      <section
        className={styles.section}
        aria-labelledby="commands-hooks-title"
      >
        <div className={styles.copy}>
          <CommandLinks commands={['hooks', 'staged']} />
          <h2 id="commands-hooks-title">{t('hooksCommandTitle')}</h2>
          <p className={styles.description}>{t('hooksCommandDesc')}</p>
          <ul className={styles.highlights}>
            <li>{t('hooksCommandSetup')}</li>
            <li>{t('hooksCommandStaged')}</li>
            <li>{t('hooksCommandTasks')}</li>
          </ul>
        </div>
        <Terminal>
          <Prompt>rs staged</Prompt>
          {'\n\n'}
          <span className={styles.success}>✔ </span>
          {'Done backing up original state!\n'}
          <span className={styles.success}>✔ </span>
          {'rs lint --fix\n'}
          <span className={styles.success}>✔ </span>
          {'rs fmt\n'}
          <span className={styles.success}>✔ </span>
          {'Done running tasks for staged files!\n'}
          <span className={styles.success}>✔ </span>
          {'Done staging changes from tasks!\n'}
          <span className={styles.success}>✔ </span>
          {'Done cleaning up temporary files!'}
        </Terminal>
      </section>
      <section className={styles.section} aria-labelledby="commands-doc-title">
        <div className={styles.copy}>
          <CommandLinks commands={['doc']} />
          <h2 id="commands-doc-title">{t('docCommandTitle')}</h2>
          <p className={styles.description}>{t('docCommandDesc')}</p>
          <ul className={styles.highlights}>
            <li>{t('docCommandMarkdown')}</li>
            <li>{t('docCommandFeatures')}</li>
            <li>{t('docCommandWorkflow')}</li>
          </ul>
        </div>
        <Terminal>
          <Prompt>rs doc</Prompt>
          {'\n'}
          <span className={styles.tool}>Rspress v2.0.0</span>
          {'\n\n'}
          {' ➜ '}
          <span className={styles.dim}>Local: </span>
          <span className={styles.accent}>http://localhost:3000/</span>
          {'\n'}
          {' ➜ '}
          <span className={styles.dim}>Network: use </span>
          <span className={styles.bold}>--host</span>
          <span className={styles.dim}> to expose</span>
          {'\n\n'}
          <LogLabel>start</LogLabel>
          {'   build started...\n'}
          <LogLabel>ready</LogLabel>
          {'   built in '}
          <span className={styles.bold}>0.18s</span>
        </Terminal>
      </section>
    </div>
  );
}
