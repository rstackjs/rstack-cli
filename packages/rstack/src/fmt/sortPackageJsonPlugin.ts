import type { Plugin } from 'prettier';
import { parsers } from 'prettier/plugins/babel';
import sortPackageJson from 'sort-package-json';

const sortPackageJsonPlugin: Plugin = {
  parsers: {
    'json-stringify': {
      ...parsers['json-stringify'],
      preprocess: (source) => sortPackageJson(source),
    },
  },
};

export { sortPackageJsonPlugin };
