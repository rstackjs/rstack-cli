import type { Config as PrettierConfig, Options as PrettierOptions } from 'prettier';

/** Plugin objects cannot cross worker boundaries and are not planned for support. */
type FmtPluginSpecifier = string | URL;

interface FmtBuiltinOptions {
  /**
   * Sort `package.json` fields using `sort-package-json`.
   * @default false
   */
  sortPackageJson?: boolean;
}

type ResolvedFmtOptions = PrettierOptions & FmtBuiltinOptions;

type FmtOptions = Omit<PrettierOptions, 'plugins'> &
  FmtBuiltinOptions & {
    plugins?: FmtPluginSpecifier[];
  };

type PrettierOverride = NonNullable<PrettierConfig['overrides']>[number];

type FmtOverride = Omit<PrettierOverride, 'options'> & {
  options?: FmtOptions;
};

interface FmtConfig extends Omit<PrettierConfig, 'plugins' | 'overrides'>, FmtBuiltinOptions {
  plugins?: FmtPluginSpecifier[];
  overrides?: FmtOverride[];
  /** Gitignore-compatible patterns relative to the Rstack config root. */
  ignorePatterns?: string[];
}

type FmtConfigDefinition = FmtConfig | (() => FmtConfig | Promise<FmtConfig>);

/** Internal project config before per-file rules are applied. */
interface ResolvedFmtConfig {
  /** Root for relative patterns and plugin paths. */
  rootPath: string;
  /** Shared Prettier options before per-file overrides. */
  baseOptions: ResolvedFmtOptions;
  /** Per-file override rules. */
  overrides: NonNullable<PrettierConfig['overrides']>;
  /** Root-relative ignore patterns. */
  ignorePatterns: string[];
}

interface DiscoverFmtFilesOptions {
  /** Absolute directory used to resolve input paths. */
  cwd: string;
  /** Files, directories, and positive or negative globs. Defaults to the current directory. */
  patterns?: string[];
  /** Resolved project config applied to discovered files. */
  config: ResolvedFmtConfig;
}

interface FmtFileRequest {
  /** Absolute path to the file. */
  path: string;
  /** Final per-file options with project plugins and the file path resolved. */
  options: ResolvedFmtOptions & Required<Pick<PrettierOptions, 'filepath'>>;
}

type FmtMode = 'write' | 'check' | 'list-different';
type FmtExitCode = 0 | 1 | 2;

interface RunFmtFilesOptions {
  /** Files with their final per-file Prettier options. */
  files: FmtFileRequest[];
  /** Whether to write changes or only report them. */
  mode: FmtMode;
  /** Maximum number of formatting workers. */
  maxWorkers?: number;
}

interface SuccessfulFmtFileResult {
  path: string;
  status: 'unchanged' | 'written' | 'different';
  durationMs: number;
}

interface FailedFmtFileResult {
  path: string;
  status: 'error';
  error: unknown;
  durationMs: number;
}

type FmtFileResult = SuccessfulFmtFileResult | FailedFmtFileResult;

interface FmtRunResult {
  files: FmtFileResult[];
  /** Recommended CLI exit code. */
  exitCode: FmtExitCode;
  durationMs: number;
}

export type {
  DiscoverFmtFilesOptions,
  FmtConfig,
  FmtConfigDefinition,
  FmtExitCode,
  FmtFileResult,
  FmtFileRequest,
  FmtMode,
  FmtPluginSpecifier,
  FmtRunResult,
  ResolvedFmtConfig,
  ResolvedFmtOptions,
  RunFmtFilesOptions,
};
