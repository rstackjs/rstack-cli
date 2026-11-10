import { useLang } from '@rspress/core/runtime';
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
  const isZh = useLang() === 'zh';

  return (
    <div className={styles.commands}>
      <section className={styles.section} aria-labelledby="commands-app-title">
        <div className={styles.copy}>
          <CommandLinks commands={['dev', 'build']} />
          <h2 id="commands-app-title">
            {isZh ? '从开发到构建，快人一步' : 'From dev to production, fast'}
          </h2>
          <p className={`rp-doc ${styles.description}`}>
            {isZh ? (
              <>
                {'基于 '}
                <Link href="https://rspack.rs/">Rspack</Link>
                {' 和 '}
                <Link href="https://rsbuild.rs/">Rsbuild</Link>
                {'，快速启动开发服务器，构建企业级 Web 应用'}
              </>
            ) : (
              <>
                {
                  'Start dev servers quickly and build enterprise-grade web applications with '
                }
                <Link href="https://rspack.rs/">Rspack</Link>
                {' and '}
                <Link href="https://rsbuild.rs/">Rsbuild</Link>
              </>
            )}
          </p>
          <ul className={styles.highlights}>
            <li className="rp-doc">
              {isZh ? (
                <>
                  {'构建速度比 webpack '}
                  <Link href="https://github.com/rstackjs/build-tools-performance">
                    快 5–20 倍
                  </Link>
                </>
              ) : (
                <>
                  {'Build '}
                  <Link href="https://github.com/rstackjs/build-tools-performance">
                    5–20× faster
                  </Link>
                  {' than webpack'}
                </>
              )}
            </li>
            <li>
              {isZh
                ? '全方位优化产物，运行更快'
                : 'Optimize bundles for faster runtime performance'}
            </li>
            <li>
              {isZh
                ? '开发与生产采用一致的打包流程'
                : 'A consistent bundling process for development and production'}
            </li>
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
          <h2 id="commands-lib-title">
            {isZh ? '构建你的库，轻松交付' : 'Your library, ready to ship'}
          </h2>
          <p className={`rp-doc ${styles.description}`}>
            {isZh ? (
              <>
                {'使用 '}
                <Link href="https://rslib.rs/">Rslib</Link>
                {
                  ' 构建可复用的 JavaScript 库，满足公共库、命令行工具和组件库的开发需求'
                }
              </>
            ) : (
              <>
                {
                  'Build reusable JavaScript libraries, CLI tools, and UI components with '
                }
                <Link href="https://rslib.rs/">Rslib</Link>
              </>
            )}
          </p>
          <ul className={styles.highlights}>
            <li>
              {isZh
                ? '一份配置，输出 ESM、CJS 和模块联邦等多种格式'
                : 'One configuration for ESM, CJS, Module Federation, and more'}
            </li>
            <li>
              {isZh
                ? '按需选择 bundle 或 bundleless 输出模式'
                : 'Choose bundle or bundleless output to suit your needs'}
            </li>
            <li>
              {isZh
                ? '使用 TypeScript 7 快速生成类型声明'
                : 'Generate type declarations quickly with TypeScript 7'}
            </li>
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
          <h2 id="commands-test-title">
            {isZh ? '更快测试，即时反馈' : 'Faster tests, instant feedback'}
          </h2>
          <p className={`rp-doc ${styles.description}`}>
            {isZh ? (
              <>
                {'使用 '}
                <Link href="https://rstest.rs/">Rstest</Link>
                {' 测试 JavaScript 代码，从本地开发到 CI 都能及时获得反馈'}
              </>
            ) : (
              <>
                {'Test JavaScript with '}
                <Link href="https://rstest.rs/">Rstest</Link>
                {' for fast feedback from local development to CI'}
              </>
            )}
          </p>
          <ul className={styles.highlights}>
            <li>
              {isZh ? '熟悉的 Jest 风格 API' : 'Familiar Jest-style APIs'}
            </li>
            <li>
              {isZh
                ? '由 Rspack 加速测试，比 Jest 快 20%+'
                : 'Tests accelerated by Rspack, 20%+ faster than Jest'}
            </li>
            <li>
              {isZh
                ? '自动复用已有构建配置，减少维护成本'
                : 'Automatically reuse your build configuration to reduce maintenance overhead'}
            </li>
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
          <h2 id="commands-check-title">
            {isZh ? '统一规范，更快检查' : 'Fast checks, consistent code'}
          </h2>
          <p className={`rp-doc ${styles.description}`}>
            {isZh
              ? '一个命令完成代码检查、格式校验和类型检查，保持团队规范一致'
              : "Keep your team's code consistent with one command for linting, formatting checks, and type checking"}
          </p>
          <ul className={styles.highlights}>
            <li>
              {isZh
                ? '代码检查速度比 ESLint 快 20–40 倍'
                : 'Lint 20–40× faster than ESLint'}
            </li>
            <li>
              {isZh
                ? '格式化速度比 Prettier 快 5–10 倍'
                : 'Format 5–10× faster than Prettier'}
            </li>
            <li>
              {isZh
                ? '兼容 ESLint 和 Prettier 的配置项与插件'
                : 'Compatible with ESLint and Prettier configuration and plugins'}
            </li>
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
          <span className={styles.dim}> (99 files)</span>
        </Terminal>
      </section>

      <section
        className={styles.section}
        aria-labelledby="commands-hooks-title"
      >
        <div className={styles.copy}>
          <CommandLinks commands={['hooks', 'staged']} />
          <h2 id="commands-hooks-title">
            {isZh ? '让检查融入每次提交' : 'Checks for every commit'}
          </h2>
          <p className={`rp-doc ${styles.description}`}>
            {isZh
              ? '将代码检查融入 Git 工作流，复用现有 lint-staged 配置，延续熟悉的 Husky 使用方式'
              : 'Add code checks to your Git workflow with familiar lint-staged configuration and Husky-style hooks'}
          </p>
          <ul className={styles.highlights}>
            <li>
              {isZh
                ? '统一管理仓库级 Git hooks'
                : 'Manage repository-wide Git hooks in one place'}
            </li>
            <li>
              {isZh ? '自动检查暂存区文件' : 'Automatically check staged files'}
            </li>
            <li>
              {isZh
                ? '灵活运行自定义命令'
                : 'Run custom commands to suit your workflow'}
            </li>
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
          <h2 id="commands-doc-title">
            {isZh ? '生成 AI 友好的文档站' : 'Build AI-friendly docs sites'}
          </h2>
          <p className={`rp-doc ${styles.description}`}>
            {isZh ? (
              <>
                {'使用 '}
                <Link href="https://rspress.rs/">Rspress</Link>
                {' 打造美观、AI 友好的静态文档站，让文档与代码一同维护'}
              </>
            ) : (
              <>
                {
                  'Build beautiful, AI-friendly static documentation sites with '
                }
                <Link href="https://rspress.rs/">Rspress</Link>
                {' and maintain them alongside your code'}
              </>
            )}
          </p>
          <ul className={styles.highlights}>
            <li>
              {isZh
                ? '使用 Markdown 和 MDX 编写内容'
                : 'Write content in Markdown and MDX'}
            </li>
            <li>
              {isZh
                ? '开箱即用的全文搜索与多语言支持'
                : 'Full-text search and multilingual support out of the box'}
            </li>
            <li>
              {isZh
                ? '自动生成 llms.txt 与 Markdown 文件，供 AI Agent 使用'
                : 'Automatically generate llms.txt and Markdown files for AI agents'}
            </li>
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
