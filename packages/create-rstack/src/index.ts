import { type Argv, checkCancel, create, select } from '@rstackjs/create-toolkit';
import path from 'node:path';

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

    const [type, language = 'js'] = template.split('-');
    return `${type}-${language}`;
  }

  const projectType = checkCancel<string>(
    await select({
      message: 'Select project type',
      options: [
        { value: 'app', label: 'Web Application' },
        { value: 'lib', label: 'Library' },
      ],
    }),
  );

  const templateType = checkCancel<string>(
    await select({
      message: projectType === 'app' ? 'Select framework' : 'Select library type',
      options:
        projectType === 'app'
          ? [
              { value: 'vanilla', label: 'Vanilla' },
              { value: 'react', label: 'React' },
              { value: 'vue', label: 'Vue' },
              { value: 'solid', label: 'Solid' },
            ]
          : [
              { value: 'node', label: 'Node.js' },
              { value: 'react', label: 'React' },
              { value: 'vue', label: 'Vue' },
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

await create({
  root: path.join(import.meta.dirname, '..'),
  name: 'rstack',
  templates: [
    'app-vanilla-js',
    'app-vanilla-ts',
    'app-react-js',
    'app-react-ts',
    'app-vue-js',
    'app-vue-ts',
    'app-solid-js',
    'app-solid-ts',
    'lib-node-js',
    'lib-node-ts',
    'lib-react-js',
    'lib-react-ts',
    'lib-vue-js',
    'lib-vue-ts',
    'lib-solid-js',
    'lib-solid-ts',
  ],
  builtinTools: [],
  getTemplateName,
});
