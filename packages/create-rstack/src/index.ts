import {
  type Argv,
  type GitResolvedContext,
  checkCancel,
  create,
  select,
} from '@rstackjs/create-toolkit';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const packageRoot = path.join(import.meta.dirname, '..');

const getTemplateName = async ({ template }: Argv): Promise<string> => {
  if (typeof template === 'string') {
    if (template === 'app' || template.startsWith('app-')) {
      const [, framework = 'vanilla', language = 'js'] = template.split('-');

      if (framework === 'js' || framework === 'ts') {
        return `app-vanilla-${framework}`;
      }

      return `app-${framework}-${language}`;
    }

    if (template === 'lib' || template.startsWith('lib-')) {
      const [, libraryType = 'node', language = 'js'] = template.split('-');

      if (libraryType === 'js' || libraryType === 'ts') {
        return `lib-node-${libraryType}`;
      }

      return `lib-${libraryType}-${language}`;
    }

    if (template === 'doc' || template.startsWith('doc-')) {
      const [, documentationType = 'basic'] = template.split('-');
      return `doc-${documentationType}`;
    }

    const [type, language = 'js'] = template.split('-');
    return `${type}-${language}`;
  }

  const projectType = checkCancel<string>(
    await select({
      message: 'Select project type',
      options: [
        { value: 'app', label: 'Web Application' },
        { value: 'lib', label: 'Library' },
        { value: 'doc', label: 'Documentation' },
      ],
    }),
  );

  if (projectType === 'doc') {
    const documentationType = checkCancel<string>(
      await select({
        message: 'Choose documentation language setup',
        initialValue: 'basic',
        options: [
          {
            value: 'basic',
            label: 'Single language',
            hint: 'docs',
          },
          {
            value: 'i18n',
            label: 'Multilingual',
            hint: 'docs/en, docs/zh',
          },
        ],
      }),
    );

    return `doc-${documentationType}`;
  }

  const templateType = checkCancel<string>(
    await select({
      message: projectType === 'app' ? 'Select framework' : 'Select library type',
      options:
        projectType === 'app'
          ? [
              { value: 'vanilla', label: 'Vanilla' },
              { value: 'react', label: 'React' },
              { value: 'preact', label: 'Preact' },
              { value: 'vue', label: 'Vue' },
              { value: 'lit', label: 'Lit' },
              { value: 'svelte', label: 'Svelte' },
              { value: 'solid', label: 'Solid' },
            ]
          : [
              { value: 'node', label: 'Node.js' },
              { value: 'react', label: 'React' },
              { value: 'vue', label: 'Vue' },
              { value: 'svelte', label: 'Svelte' },
              { value: 'solid', label: 'Solid' },
            ],
    }),
  );

  const language = checkCancel<string>(
    await select({
      message: 'Select language',
      options: [
        { value: 'ts', label: 'TypeScript' },
        { value: 'js', label: 'JavaScript' },
      ],
    }),
  );

  return `${projectType}-${templateType}-${language}`;
};

const getStagedConfig = (templateName: string): string => {
  const scriptExtensions = ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts'];
  const formatExtensions = ['json', 'jsonc', 'md', 'mdx', 'css', 'html', 'yml', 'yaml'];
  const componentExtensions = ['svelte', 'vue'];
  const templateFormatExtensions = [
    ...formatExtensions,
    ...componentExtensions.filter((extension) => templateName.includes(extension)),
  ];

  return [
    '',
    'define.staged({',
    `  '*.{${scriptExtensions.join(',')}}': ['rs lint --fix', 'rs fmt'],`,
    `  '*.{${templateFormatExtensions.join(',')}}': 'rs fmt',`,
    '});',
    '',
  ].join('\n');
};

const injectStagedSetup = async ({
  templateName,
  distFolder,
  gitEnabled,
  isGitRoot,
}: GitResolvedContext): Promise<void> => {
  if (!gitEnabled || !isGitRoot) {
    return;
  }

  const configExtension = templateName.endsWith('-js') ? 'js' : 'ts';
  const packageJsonPath = path.join(distFolder, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    scripts: Record<string, string>;
  };

  packageJson.scripts = Object.fromEntries(
    Object.entries({ ...packageJson.scripts, prepare: 'rs setup' }).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );

  const hooksDirectory = path.join(distFolder, '.rstack', 'hooks');
  await mkdir(hooksDirectory, { recursive: true });
  await Promise.all([
    writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`),
    appendFile(
      path.join(distFolder, `rstack.config.${configExtension}`),
      getStagedConfig(templateName),
    ),
    writeFile(path.join(hooksDirectory, 'pre-commit'), 'rs staged\n'),
  ]);
};

await create({
  root: packageRoot,
  name: 'rstack',
  templates: [
    'app-vanilla-js',
    'app-vanilla-ts',
    'app-react-js',
    'app-react-ts',
    'app-preact-js',
    'app-preact-ts',
    'app-vue-js',
    'app-vue-ts',
    'app-lit-js',
    'app-lit-ts',
    'app-svelte-js',
    'app-svelte-ts',
    'app-solid-js',
    'app-solid-ts',
    'lib-node-js',
    'lib-node-ts',
    'lib-react-js',
    'lib-react-ts',
    'lib-vue-js',
    'lib-vue-ts',
    'lib-svelte-js',
    'lib-svelte-ts',
    'lib-solid-js',
    'lib-solid-ts',
    'doc-basic',
    'doc-i18n',
  ],
  builtinTools: [],
  getTemplateName,
  onGitResolved: injectStagedSetup,
});
