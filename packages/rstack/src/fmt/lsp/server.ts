import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import {
  createConnection,
  MessageType,
  ShowMessageNotification,
  TextDocumentSyncKind,
  type Connection,
  type InitializeParams,
  type TextEdit,
} from 'vscode-languageserver/node';
import { createFmtFileResolver, type FmtFileResolver } from '../fileResolver.ts';
import { formatFmtSource } from '../format.ts';
import { createIgnoreMatcher, type IgnorePredicate } from '../ignore.ts';
import type { ResolvedFmtConfig } from '../types.ts';
import { computeMinimalTextEdit } from './minimalEdit.ts';

interface RunFmtLspOptions {
  /** Base for relative CLI paths, and the workspace root when the client reports none. */
  cwd: string;
  /** Ignore files; relative paths resolve from `cwd`, like a relative `--config`. */
  ignorePaths?: string[];
  /** Loads the project config for a workspace root. */
  loadConfig: (cwd: string) => Promise<ResolvedFmtConfig>;
}

/** The client's workspace root anchors the config; `cwd` keeps anchoring CLI paths. */
type FmtLspSessionOptions = RunFmtLspOptions & { root: string };

interface FmtLspSession {
  isIgnored: IgnorePredicate;
  resolveFile: FmtFileResolver;
}

const toFilePath = (uri: string): string | undefined => {
  try {
    const url = new URL(uri);
    // Untitled buffers and other schemes have no path to infer options from.
    return url.protocol === 'file:' ? fileURLToPath(url) : undefined;
  } catch {
    return undefined;
  }
};

/** Formats console arguments the way the library's own `patchConsole` does. */
const serializeConsoleArguments = (args: unknown[]): string =>
  args.map((arg) => (typeof arg === 'string' ? arg : inspect(arg))).join(' ');

/**
 * Sends everything written to the console over the connection as log messages.
 *
 * Anything printed to stdout while the server runs corrupts the protocol
 * framing, so every console method that writes to a standard stream is
 * rerouted, mirroring the `patchConsole` the library applies only on its own
 * `--stdio` argv branch.
 */
const redirectConsoleToConnection = (connection: Connection): void => {
  for (const level of ['log', 'info', 'debug', 'warn', 'error'] as const) {
    console[level] = (...args: unknown[]): void =>
      connection.console[level](serializeConsoleArguments(args));
  }
  console.dir = (item: unknown, options?: object): void =>
    connection.console.log(inspect(item, options));
  // `dir` and `dirxml` are the only methods that write to a standard stream
  // without going through the five rerouted above; in Node, `dirxml` is `log`.
  console.dirxml = (...args: unknown[]): void =>
    connection.console.log(serializeConsoleArguments(args));
  console.trace = (...args: unknown[]): void => {
    const stack = new Error().stack?.replace(/(.+\n){2}/, '') ?? '';
    const message = args.length === 0 ? 'Trace' : `Trace: ${serializeConsoleArguments(args)}`;
    connection.console.log(`${message}\n${stack}`);
  };
  console.assert = (assertion?: unknown, ...args: unknown[]): void => {
    if (assertion) {
      return;
    }
    connection.console.error(
      args.length === 0
        ? 'Assertion failed'
        : `Assertion failed: ${serializeConsoleArguments(args)}`,
    );
  };
  const counters = new Map<string, number>();
  console.count = (label: unknown = 'default'): void => {
    const key = String(label);
    const count = (counters.get(key) ?? 0) + 1;
    counters.set(key, count);
    connection.console.log(`${key}: ${count}`);
  };
  console.countReset = (label?: unknown): void => {
    if (label === undefined) {
      counters.clear();
    } else {
      counters.delete(String(label));
    }
  };
};

const resolveWorkspaceRoot = (params: InitializeParams): string | undefined => {
  const rootUri = params.workspaceFolders?.[0]?.uri ?? params.rootUri;

  return (rootUri ? toFilePath(rootUri) : undefined) ?? params.rootPath ?? undefined;
};

/** Loads everything a formatting request needs, once per server lifetime. */
const createFmtLspSession = async ({
  root,
  cwd,
  ignorePaths,
  loadConfig,
}: FmtLspSessionOptions): Promise<FmtLspSession> => {
  const config = await loadConfig(root);
  const isIgnored = await createIgnoreMatcher({ config, cwd, ignorePaths });

  return {
    isIgnored,
    resolveFile: createFmtFileResolver(config),
  };
};

/** Formats an editor buffer, returning nothing when the file is not formatted. */
const formatDocumentSource = async (
  session: FmtLspSession,
  filePath: string,
  source: string,
): Promise<string | undefined> => {
  if (session.isIgnored(filePath)) {
    return undefined;
  }

  const file = await session.resolveFile(filePath);
  const result = await formatFmtSource(file, () => source);

  return result.status === 'formatted' ? result.formatted : undefined;
};

/**
 * Turns a reformat of an open buffer into the edit the editor applies.
 *
 * The client can replace the buffer while the formatter runs, so the text is
 * re-read afterwards: the edit stays valid exactly as long as the text it was
 * computed from is still the text the client holds.
 */
const createDocumentEdits = async (
  getText: () => string | undefined,
  format: (source: string) => Promise<string | undefined>,
): Promise<TextEdit[]> => {
  const source = getText();
  if (source === undefined) {
    return [];
  }

  const formatted = await format(source);
  if (getText() !== source) {
    return [];
  }

  const edit = formatted === undefined ? undefined : computeMinimalTextEdit(source, formatted);

  return edit ? [edit] : [];
};

const startFmtLsp = (options: RunFmtLspOptions, onExit: () => void): void => {
  // The streams are passed explicitly because `rs fmt --lsp` carries none of
  // the transport flags the default connection looks for.
  const connection = createConnection(process.stdin, process.stdout);
  // Passing the streams explicitly also skips the console patching the library
  // only applies to its own `--stdio` branch. The config file and the prettier
  // plugins are loaded in this process, so a stray `console.log` would write
  // raw bytes into the JSON-RPC stream and break the client's framing parser.
  // This runs before any user code can load.
  redirectConsoleToConnection(connection);
  // Full document sync: every change carries the whole buffer, so tracking a
  // document is replacing one string, and a dropped or reordered change heals
  // on the next one.
  const documents = new Map<string, string>();

  connection.onDidOpenTextDocument(({ textDocument }) => {
    documents.set(textDocument.uri, textDocument.text);
  });
  connection.onDidChangeTextDocument(({ textDocument, contentChanges }) => {
    const change = contentChanges[0];
    if (change) {
      documents.set(textDocument.uri, change.text);
    } else {
      // An empty change list is a protocol violation; dropping the entry keeps
      // stale text from standing in for the buffer until the next change.
      documents.delete(textDocument.uri);
    }
  });
  connection.onDidCloseTextDocument(({ textDocument }) => {
    documents.delete(textDocument.uri);
  });

  let root = options.cwd;
  let sessionPromise: Promise<FmtLspSession> | undefined;
  let reportedSessionError: string | undefined;

  // TODO: watch the config file and reset the session when it changes.
  const getSession = (): Promise<FmtLspSession> =>
    (sessionPromise ??= createFmtLspSession({ ...options, root }).catch((error: unknown) => {
      // Retry on the next request rather than caching the failure forever.
      sessionPromise = undefined;
      // A workspace that cannot be set up returns no edits for every document,
      // which looks like "nothing to format" in editors that hide the server
      // log, so it is shown to the user instead of only being logged. Repeats
      // of the same failure stay silent so saving a file cannot spam the editor.
      const message = `rs fmt cannot format this workspace: ${String(error)}`;
      if (reportedSessionError !== message) {
        reportedSessionError = message;
        // A notification rather than `window.showErrorMessage`, which sends a
        // request the server would then wait on for a response it does not need.
        void connection.sendNotification(ShowMessageNotification.type, {
          type: MessageType.Error,
          message,
        });
      }
      throw error;
    }));

  connection.onExit(onExit);

  connection.onInitialize((params) => {
    root = resolveWorkspaceRoot(params) ?? options.cwd;

    return {
      // The project config is the single source of truth, so client formatting
      // options are ignored and nothing beyond formatting is advertised. Full
      // sync spares the client from computing deltas the server never uses.
      capabilities: {
        documentFormattingProvider: true,
        textDocumentSync: TextDocumentSyncKind.Full,
      },
    };
  });

  connection.onDocumentFormatting(async ({ textDocument }): Promise<TextEdit[]> => {
    const filePath = toFilePath(textDocument.uri);
    if (!filePath) {
      return [];
    }

    // A formatting failure must never disrupt editing; unsupported, ignored,
    // and unparsable documents all resolve to "no edits".
    try {
      const session = await getSession();

      return await createDocumentEdits(
        () => documents.get(textDocument.uri),
        (source) => formatDocumentSource(session, filePath, source),
      );
    } catch (error) {
      connection.console.error(`Failed to format "${filePath}": ${String(error)}`);
      return [];
    }
  });

  connection.listen();
};

/**
 * Serves document formatting over the Language Server Protocol on stdio.
 *
 * The connection owns the process lifetime: it answers `shutdown`, exits on
 * `exit`, and stops the process when the client closes stdin. Nothing else may
 * write to stdout while the server runs.
 *
 * The returned promise stays pending for as long as the server serves requests,
 * so the caller reports a failed startup like every other `rs fmt` failure.
 */
const runFmtLsp = (options: RunFmtLspOptions): Promise<void> =>
  // A synchronous throw from the executor rejects the promise, so a failed
  // startup surfaces to the caller without an explicit try/catch.
  new Promise<void>((resolvePromise) => startFmtLsp(options, resolvePromise));

export { createDocumentEdits, runFmtLsp };
