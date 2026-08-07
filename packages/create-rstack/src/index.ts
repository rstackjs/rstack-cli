import {
  type Argv,
  checkCancel,
  create,
  type ESLintTemplateName,
  type RslintTemplateName,
  select,
} from '@rstackjs/create-toolkit';
import path from 'node:path';

const getTemplateName = async ({ template }: Argv): Promise<string> => {
  if (typeof template === 'string') {
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

  const language = checkCancel<string>(
    await select({
      message: 'Select language',
      options: [
        { value: 'ts', label: 'TypeScript' },
        { value: 'js', label: 'JavaScript' },
      ],
    }),
  );

  return `${projectType}-${language}`;
};

const mapESLintTemplate = (templateName: string): ESLintTemplateName =>
  templateName.endsWith('-ts') ? 'vanilla-ts' : 'vanilla-js';

const mapRslintTemplate = (templateName: string): RslintTemplateName =>
  templateName.endsWith('-ts') ? 'vanilla-ts' : 'vanilla-js';

await create({
  root: path.join(import.meta.dirname, '..'),
  name: 'rstack',
  templates: ['app-js', 'app-ts', 'lib-js', 'lib-ts'],
  builtinTools: [],
  getTemplateName,
  mapESLintTemplate,
  mapRslintTemplate,
});
