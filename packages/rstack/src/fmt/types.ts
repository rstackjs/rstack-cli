import type { Config as PrettierConfig, Options as PrettierOptions } from 'prettier';

interface FmtConfig extends PrettierConfig {
  /** Gitignore-compatible patterns relative to the Rstack config root. */
  ignorePatterns?: string[];
}

type FmtConfigDefinition = FmtConfig | (() => FmtConfig | Promise<FmtConfig>);

/** Internal project config before per-file rules are applied. */
interface ResolvedFmtConfig {
  /** Root for relative patterns and plugin paths. */
  rootPath: string;
  /** Shared Prettier options before per-file overrides. */
  baseOptions: PrettierOptions;
  /** Per-file override rules. */
  overrides: NonNullable<PrettierConfig['overrides']>;
  /** Root-relative ignore patterns. */
  ignorePatterns: string[];
}

export type { FmtConfig, FmtConfigDefinition, ResolvedFmtConfig };
