import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getRandomPort, waitForFile } from '@rstackjs/test-utils';
import { test } from '#test-helpers';

test('should restart dev server and reload config when Rstack config changes', async ({
  prepareDist,
  execCliAsync,
}) => {
  const dist1 = await prepareDist();
  const dist2 = await prepareDist('dist-2');
  const configFile = path.join(
    import.meta.dirname,
    'test-temp-rstack.config.ts',
  );

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

  await waitForFile(dist1);

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

  await waitForFile(dist2);
});

test('should reload config when an imported shared config changes', async ({
  execCliAsync,
  logHelper,
  expect,
}) => {
  const configFile = path.join(
    import.meta.dirname,
    'test-temp-import.config.ts',
  );
  const importedFile = path.join(import.meta.dirname, 'test-temp-imported.ts');
  const port = await getRandomPort();
  const url = `http://localhost:${port}`;

  await writeFile(
    importedFile,
    `export const sharedConfig = {
  app: {
    html: { title: 'before import change' },
  },
};
`,
  );
  await writeFile(
    configFile,
    `import { define } from 'rstack';
import { sharedConfig } from './test-temp-imported.ts';

define.extends([sharedConfig]);

define.app({
  server: { port: ${port} },
});
`,
  );

  execCliAsync('dev --config test-temp-import.config.ts');
  await logHelper.expectBuildEnd();
  const initialResponse = await fetch(url);
  expect(await initialResponse.text()).toContain(
    '<title>before import change</title>',
  );
  logHelper.clearLogs();

  await writeFile(
    importedFile,
    `export const sharedConfig = {
  app: {
    html: { title: 'after import change' },
  },
};
`,
  );

  await logHelper.expectLog(
    'restarting server as test-temp-imported.ts changed',
  );
  await logHelper.expectBuildEnd();
  const updatedResponse = await fetch(url);
  expect(await updatedResponse.text()).toContain(
    '<title>after import change</title>',
  );
});
