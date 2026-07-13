import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getRandomPort, waitForFile } from '@rstackjs/test-utils';
import { test } from '#test-helpers';

test('should restart dev server and reload config when Rstack config changes', async ({
  prepareDist,
  execCliAsync,
}) => {
  const dist1 = await prepareDist();
  const dist2 = await prepareDist('dist-2');
  const configFile = path.join(import.meta.dirname, 'test-temp-rstack.config.ts');

  await rm(configFile, { force: true });

  await writeFile(
    configFile,
    `import { define } from 'rstack';

define.app({
  dev: {
    writeToDisk: true,
  },
  server: { port: ${await getRandomPort()} },
});
`,
  );

  execCliAsync('dev --config test-temp-rstack.config.ts');

  await waitForFile(dist1, { interval: 50 });

  await writeFile(
    configFile,
    `import { define } from 'rstack';

define.app({
  dev: {
    writeToDisk: true,
  },
  output: {
    distPath: 'dist-2',
  },
  server: { port: ${await getRandomPort()} },
});
`,
  );

  await waitForFile(dist2, { interval: 50 });
}, 30_000);

test('should reload config when an imported file changes', async ({ execCliAsync, logHelper }) => {
  const configFile = path.join(import.meta.dirname, 'test-temp-import.config.ts');
  const importedFile = path.join(import.meta.dirname, 'test-temp-imported.ts');

  await writeFile(importedFile, '');
  await writeFile(
    configFile,
    `import { define } from 'rstack';
import './test-temp-imported.ts';

define.app({
  server: { port: ${await getRandomPort()} },
});
`,
  );

  execCliAsync('dev --config test-temp-import.config.ts');
  await logHelper.expectBuildEnd();
  logHelper.clearLogs();

  await writeFile(importedFile, '// changed\n');

  await logHelper.expectLog('restarting server as test-temp-imported.ts changed');
}, 30_000);
