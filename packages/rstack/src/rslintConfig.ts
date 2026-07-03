import { loadRstackConfig, type RslintConfig } from './config.js';

const configs = await loadRstackConfig();

const lintConfig: RslintConfig = configs.lint ?? [];

export default lintConfig;
