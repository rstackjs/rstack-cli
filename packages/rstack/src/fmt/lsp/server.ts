import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  createConnection,
  MessageType,
  ShowMessageNotification,
  TextDocuments,
  type Connection,
  type InitializeParams,
  type TextEdit,
} from 'vscode-languageserver/node';
import { createFmtOptionsResolver, type FmtOptionsResolver } from '../config.ts';
import {
  createFileRequest,
  createLazyPluginResolver,
  resolveFileRequestPlugins,
} from '../discovery.ts';
import { formatFmtSource } from '../format.ts';
import { createIgnoreMatcher, type IgnorePredicate } from '../ignore.ts';
import type { FmtPluginResolver } from '../plugins.ts';
import type { ResolvedFmtConfig } from '../types.ts';
import { computeMinimalEdit } from './minimalEdit.ts';

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
  resolveOptions: FmtOptionsResolver;
  /** Resolves plugin specifiers through the file system; cached per session. */
  getPluginResolver: () => Promise<FmtPluginResolver>;
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
    resolveOptions: createFmtOptionsResolver(config),
    getPluginResolver: createLazyPluginResolver(config.rootPath),
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

  const file = await resolveFileRequestPlugins(
    createFileRequest(filePath, session.resolveOptions),
    session.getPluginResolver,
  );
  const result = await formatFmtSource(file, () => source);

  return result.status === 'formatted' ? result.formatted : undefined;
};

/**
 * Turns a reformat of an open buffer into the edit the editor applies.
 *
 * `TextDocuments` mutates the same document instance on every change, so the
 * buffer can move on while the formatter runs. The text is snapshotted up
 * front and the version is re-checked afterwards, which keeps the returned
 * positions describing the text the edit was computed from.
 */
const createDocumentEdits = async (
  document: TextDocument,
  format: (source: string) => Promise<string | undefined>,
): Promise<TextEdit[]> => {
  const { version } = document;
  const source = document.getText();
  const formatted = await format(source);
  // Edits for a buffer the client has already changed would be applied to text
  // they were never computed for; the editor formats again after the change.
  if (document.version !== version) {
    return [];
  }

  const edit = formatted === undefined ? undefined : computeMinimalEdit(source, formatted);
  if (!edit) {
    return [];
  }

  // Nothing awaits between the version check and this mapping, so the document
  // still holds `source` and its incrementally maintained line table maps the
  // offsets without rebuilding one from scratch.
  return [
    {
      range: {
        start: document.positionAt(edit.start),
        end: document.positionAt(edit.end),
      },
      newText: edit.newText,
    },
  ];
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
  // Document sync also maps offsets to UTF-16 positions for the returned edits.
  const documents = new TextDocuments(TextDocument);

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
      // options are ignored and no other capability is advertised.
      capabilities: { documentFormattingProvider: true },
    };
  });

  connection.onDocumentFormatting(async ({ textDocument }): Promise<TextEdit[]> => {
    const document = documents.get(textDocument.uri);
    const filePath = toFilePath(textDocument.uri);
    if (!document || !filePath) {
      return [];
    }

    // A formatting failure must never disrupt editing; unsupported, ignored,
    // and unparsable documents all resolve to "no edits".
    try {
      const session = await getSession();

      return await createDocumentEdits(document, (source) =>
        formatDocumentSource(session, filePath, source),
      );
    } catch (error) {
      connection.console.error(`Failed to format "${filePath}": ${String(error)}`);
      return [];
    }
  });

  documents.listen(connection);
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
