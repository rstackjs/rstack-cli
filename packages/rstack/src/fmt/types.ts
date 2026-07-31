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

interface FormatTextOptions {
  /** File path used to resolve per-file options and infer the parser. */
  filePath: string;
  /** Cursor offset in the source to preserve across formatting. */
  cursorOffset?: number;
  /** Resolved project config used to derive per-file options. */
  config: ResolvedFmtConfig;
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
  /** Final Prettier options with the parser and file path resolved. */
  options: PrettierOptions & Required<Pick<PrettierOptions, 'filepath' | 'parser'>>;
}

type FmtMode = 'write' | 'check' | 'list-different';
type FmtExitCode = 0 | 1 | 2;

interface RunFmtFilesOptions {
  /** Files with their final per-file Prettier options. */
  files: FmtFileRequest[];
  /** Whether to write changes or only report them. */
  mode: FmtMode;
  /** Persistent cache support is added in a later implementation step. */
  cache: false;
  /** Parallel execution support is added in a later implementation step. */
  parallel: false;
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

interface FormattedTextResult {
  status: 'formatted';
  formatted: string;
  cursorOffset?: number;
}

interface SkippedTextResult {
  status: 'skipped';
  reason: 'unsupported';
}

type FormatTextResult = FormattedTextResult | SkippedTextResult;

export type {
  DiscoverFmtFilesOptions,
  FmtConfig,
  FmtConfigDefinition,
  FmtExitCode,
  FmtFileResult,
  FmtFileRequest,
  FmtMode,
  FmtRunResult,
  FormatTextOptions,
  FormatTextResult,
  ResolvedFmtConfig,
  RunFmtFilesOptions,
};
