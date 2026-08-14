import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getDistFiles, getFileContent, getRandomPort } from '@rstackjs/test-utils';
import { test } from '#test-helpers';

const expectedText = 'define.doc works';

test('should build docs with define.doc config', async ({ prepareDist, execCli, expect }) => {
  const distPath = await prepareDist('doc_build');

  execCli('doc build');

  const files = await getDistFiles(distPath);
  const output = getFileContent(files, 'index.html');

  expect(output).toContain(expectedText);
}, 30_000);

test('should restart doc dev server when Rstack config changes', async ({
  execCliAsync,
  logHelper,
}) => {
  const configFile = path.join(import.meta.dirname, 'test-temp-rstack.config.ts');
  const userWatchFile = path.join(import.meta.dirname, 'test-temp-user-watch.txt');

  const writeConfig = (title: string) =>
    writeFile(
      configFile,
      `import { define } from 'rstack';

define.doc({
  root: 'docs',
  title: '${title}',
  builderConfig: {
    dev: {
      watchFiles: {
        paths: ${JSON.stringify(userWatchFile)},
        type: 'restart',
      },
    },
  },
});
`,
    );

  await writeFile(userWatchFile, 'initial\n');
  await writeConfig('before config change');

  execCliAsync(`doc --config test-temp-rstack.config.ts --port ${await getRandomPort()}`);
  await logHelper.expectBuildEnd();
  logHelper.clearLogs();

  await writeConfig('after config change');

  await logHelper.expectLog('restarting server as test-temp-rstack.config.ts changed');
  await logHelper.expectBuildEnd();
  logHelper.clearLogs();

  await writeFile(userWatchFile, 'changed\n');

  await logHelper.expectLog('restarting server as test-temp-user-watch.txt changed');
  await logHelper.expectBuildEnd();
}, 30_000);

test('should restart doc dev server when an imported config file changes', async ({
  execCliAsync,
  logHelper,
}) => {
  const configFile = path.join(import.meta.dirname, 'test-temp-import.config.ts');
  const importedFile = path.join(import.meta.dirname, 'test-temp-imported.ts');

  await writeFile(importedFile, "export const title = 'before import change';\n");
  await writeFile(
    configFile,
    `import { define } from 'rstack';
import { title } from './test-temp-imported.ts';

define.doc({
  root: 'docs',
  title,
});
`,
  );

  execCliAsync(`doc --config test-temp-import.config.ts --port ${await getRandomPort()}`);
  await logHelper.expectBuildEnd();
  logHelper.clearLogs();

  await writeFile(importedFile, "export const title = 'after import change';\n");

  await logHelper.expectLog('restarting server as test-temp-imported.ts changed');
  await logHelper.expectBuildEnd();
}, 30_000);
