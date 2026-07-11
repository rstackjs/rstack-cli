import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expectFile, getRandomPort, test } from '#test-helpers';

test('should restart dev server and reload config when Rstack config changes', async ({
  execCliAsync,
}) => {
  const dist1 = path.join(import.meta.dirname, 'dist');
  const dist2 = path.join(import.meta.dirname, 'dist-2');
  const configFile = path.join(import.meta.dirname, 'test-temp-rstack.config.ts');

  await rm(dist1, { recursive: true, force: true });
  await rm(dist2, { recursive: true, force: true });
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

  await expectFile(dist1);

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

  await expectFile(dist2);
}, 30_000);
