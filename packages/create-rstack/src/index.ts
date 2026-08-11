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

const templateNameMap = {
  'app-vanilla': 'app-vanilla-js',
  'app-vanilla-ts': 'app-vanilla-ts',
  'app-react': 'app-react-js',
  'app-react-ts': 'app-react-ts',
  'app-preact': 'app-preact-js',
  'app-preact-ts': 'app-preact-ts',
  'app-vue': 'app-vue-js',
  'app-vue-ts': 'app-vue-ts',
  'app-lit': 'app-lit-js',
  'app-lit-ts': 'app-lit-ts',
  'app-svelte': 'app-svelte-js',
  'app-svelte-ts': 'app-svelte-ts',
  'app-solid': 'app-solid-js',
  'app-solid-ts': 'app-solid-ts',
  'lib-node': 'lib-node-js',
  'lib-node-ts': 'lib-node-ts',
  'lib-react': 'lib-react-js',
  'lib-react-ts': 'lib-react-ts',
  'lib-vue': 'lib-vue-js',
  'lib-vue-ts': 'lib-vue-ts',
  'lib-svelte': 'lib-svelte-js',
  'lib-svelte-ts': 'lib-svelte-ts',
  'lib-solid': 'lib-solid-js',
  'lib-solid-ts': 'lib-solid-ts',
  doc: 'doc-basic',
  'doc-i18n': 'doc-i18n',
} as const;

type TemplateName = keyof typeof templateNameMap;

const isTemplateName = (template: string): template is TemplateName =>
  Object.hasOwn(templateNameMap, template);

const resolveTemplateName = (template: string): string => {
  if (!isTemplateName(template)) {
    throw new Error(`Invalid input: template "${template}" not found.`);
  }

  return templateNameMap[template];
};

const getTemplateName = async ({ template }: Argv): Promise<string> => {
  if (typeof template === 'string') {
    if (/^(?:app|lib|doc)(?:-|$)/u.test(template)) {
      return resolveTemplateName(template);
    }

    return template;
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

    return resolveTemplateName(documentationType === 'basic' ? 'doc' : 'doc-i18n');
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

  const templateName = `${projectType}-${templateType}${language === 'ts' ? '-ts' : ''}`;
  return resolveTemplateName(templateName);
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
  templates: Object.keys(templateNameMap),
  builtinTools: [],
  getTemplateName,
  onGitResolved: injectStagedSetup,
});
