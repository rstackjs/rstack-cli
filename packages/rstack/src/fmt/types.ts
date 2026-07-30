import type { Config as PrettierConfig } from 'prettier';

interface FmtConfig extends PrettierConfig {
  /** Gitignore-compatible patterns relative to the Rstack config root. */
  ignorePatterns?: string[];
}

type FmtConfigDefinition = FmtConfig | (() => FmtConfig | Promise<FmtConfig>);

export type { FmtConfig, FmtConfigDefinition };
