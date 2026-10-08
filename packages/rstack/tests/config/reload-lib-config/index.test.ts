import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { waitForFile } from '@rstackjs/test-utils';
import { test } from '#test-helpers';

test('should restart lib watch build when Rstack config changes', async ({
  prepareDist,
  execCliAsync,
  logHelper,
}) => {
  const dist1 = await prepareDist();
  const dist2 = await prepareDist('dist-2');
  const configFile = path.join(
    import.meta.dirname,
    'test-temp-rstack.config.ts',
  );
  const userWatchFile = path.join(
    import.meta.dirname,
    'test-temp-user-watch.txt',
  );

  const writeConfig = (distPath: string) =>
    writeFile(
      configFile,
      `import { define } from 'rstack';

define.lib({
  dev: {
    watchFiles: {
      paths: ${JSON.stringify(userWatchFile)},
      type: 'restart',
    },
  },
  output: {
    distPath: '${distPath}',
  },
});
`,
    );

  await writeFile(userWatchFile, 'initial\n');
  await writeConfig('dist');

  execCliAsync('lib --watch --config test-temp-rstack.config.ts');
  await logHelper.expectLog('build completed, watching for changes...');
  await waitForFile(path.join(dist1, 'index.js'));
  logHelper.clearLogs();

  await writeConfig('dist-2');

  await logHelper.expectLog(
    'restarting build as test-temp-rstack.config.ts changed',
  );
  await logHelper.expectLog('build completed, watching for changes...');
  await waitForFile(path.join(dist2, 'index.js'));
  logHelper.clearLogs();

  await writeFile(userWatchFile, 'changed\n');

  await logHelper.expectLog(
    'restarting build as test-temp-user-watch.txt changed',
  );
  await logHelper.expectLog('build completed, watching for changes...');
});

test('should restart lib watch build when an imported config file changes', async ({
  prepareDist,
  execCliAsync,
  logHelper,
}) => {
  const dist1 = await prepareDist('dist-import-1');
  const dist2 = await prepareDist('dist-import-2');
  const configFile = path.join(
    import.meta.dirname,
    'test-temp-import.config.ts',
  );
  const importedFile = path.join(import.meta.dirname, 'test-temp-imported.ts');

  await writeFile(importedFile, "export const distPath = 'dist-import-1';\n");
  await writeFile(
    configFile,
    `import { define } from 'rstack';
import { distPath } from './test-temp-imported.ts';

define.lib({
  output: {
    distPath,
  },
});
`,
  );

  execCliAsync('lib --watch --config test-temp-import.config.ts');
  await logHelper.expectLog('build completed, watching for changes...');
  await waitForFile(path.join(dist1, 'index.js'));
  logHelper.clearLogs();

  await writeFile(importedFile, "export const distPath = 'dist-import-2';\n");

  await logHelper.expectLog(
    'restarting build as test-temp-imported.ts changed',
  );
  await logHelper.expectLog('build completed, watching for changes...');
  await waitForFile(path.join(dist2, 'index.js'));
});
