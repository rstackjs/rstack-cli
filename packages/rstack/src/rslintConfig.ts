import { getConfig, clearConfig, loadRstackConfig, type RslintConfig } from './config.js';

await loadRstackConfig();

const lintConfig: RslintConfig = getConfig('lint') ?? [];

clearConfig();

export default lintConfig;
