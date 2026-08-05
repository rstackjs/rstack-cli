import { resolve } from 'node:path';
import { createFileRequest } from './discovery.ts';
import { formatFmtSource } from './format.ts';
import { createIgnoreMatcher } from './ignore.ts';
import type { ResolvedFmtConfig } from './types.ts';

interface RunFmtStdinOptions {
  /** Path used for per-file options and parser inference; it need not exist on disk. */
  filepath: string;
  /** Absolute directory used to resolve the path. */
  cwd: string;
  /** Ignore files resolved from `cwd`. */
  ignorePaths?: string[];
  /** Skip input when no parser can be inferred from `filepath`. */
  ignoreUnknown?: boolean;
  /** Loads the project config; its failures surface only after stdin is drained. */
  loadConfig: () => Promise<ResolvedFmtConfig>;
}

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
};

/**
 * Writes to stdout directly to keep the output byte-exact. A reader that
 * closes the pipe early (`| head`) surfaces EPIPE, which is not a failure;
 * other stream errors reject so the CLI-level handler reports them.
 */
const writeStdout = (output: string): Promise<void> =>
  new Promise((resolvePromise, reject) => {
    // The stream also emits 'error' for the same failure; swallow the event so
    // only the write callback reports it.
    process.stdout.once('error', () => {});
    process.stdout.write(output, (error) => {
      if (error && (error as NodeJS.ErrnoException).code !== 'EPIPE') {
        reject(error);
      } else {
        resolvePromise();
      }
    });
  });

/**
 * Formats stdin on the main thread and writes the result to stdout.
 * Nothing but the formatted output may reach stdout in this mode.
 */
const runFmtStdin = async ({
  filepath,
  cwd,
  ignorePaths,
  ignoreUnknown,
  loadConfig,
}: RunFmtStdinOptions): Promise<void> => {
  const configPromise = loadConfig();
  // Drain stdin before surfacing any failure, otherwise a writer that already
  // queued more than the pipe buffer sees EPIPE instead of the real error.
  configPromise.catch(() => {});
  const source = await readStdin();
  const config = await configPromise;

  const absolutePath = resolve(cwd, filepath);
  const isIgnored = await createIgnoreMatcher({
    config,
    cwd,
    ignorePaths,
  });
  if (isIgnored(absolutePath)) {
    await writeStdout(source);
    return;
  }

  if (source === '') {
    return;
  }

  let file = createFileRequest(absolutePath, config);
  if (file.options.plugins?.length) {
    const { createFmtPluginResolver } = await import(
      /* rspackChunkName: 'fmtPlugins' */
      './plugins.ts'
    );
    file = {
      ...file,
      options: createFmtPluginResolver(config.rootPath)(file.options),
    };
  }

  const result = await formatFmtSource(file, () => source);

  if (result.status === 'unsupported') {
    if (ignoreUnknown) {
      return;
    }
    throw new Error(`No parser could be inferred for "${filepath}".`);
  }

  await writeStdout(result.formatted);
};

export { runFmtStdin };
