import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { RSTACK_BIN_PATH } from '#test-helpers';
import { createCliEnv } from './helpers.ts';

type JsonRpcMessage = {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
};

export type Position = { line: number; character: number };
export type TextEdit = { range: { start: Position; end: Position }; newText: string };

export type ShownMessage = { type: number; message: string };

export type LspClient = {
  notify: (method: string, params: unknown) => void;
  /** Initializes the server with `root` as the workspace root; defaults to the spawn cwd. */
  initialize: (root?: string) => Promise<{ capabilities: Record<string, unknown> }>;
  openDocument: (uri: string, languageId: string, text: string) => void;
  formatDocument: (uri: string) => Promise<TextEdit[]>;
  /** `window/showMessage` notifications received so far, in order. */
  shownMessages: () => ShownMessage[];
  /** Runs the shutdown handshake and resolves with the exit code. */
  stop: () => Promise<number | null>;
  stderr: () => string;
};

const CONTENT_LENGTH_REGEXP = /content-length:\s*(\d+)/i;
/** A header block is `key: value` lines separated by `\r\n` and nothing else. */
const HEADER_BLOCK_REGEXP = /^[^\r\n:]+:[^\r\n]*(?:\r\n[^\r\n:]+:[^\r\n]*)*$/;

export const toFileUri = (filePath: string): string => pathToFileURL(filePath).href;

/** Applies LSP text edits to a document, mirroring an editor. */
export const applyTextEdits = (text: string, edits: TextEdit[]): string =>
  TextDocument.applyEdits(TextDocument.create('file:///document', 'plaintext', 1, text), edits);

const readMessage = (buffer: Buffer): { message: JsonRpcMessage; rest: Buffer } | undefined => {
  const headerEnd = buffer.indexOf('\r\n\r\n');
  if (headerEnd === -1) {
    return undefined;
  }

  const headers = buffer.subarray(0, headerEnd).toString('ascii');
  // Real clients fall out of sync here, so anything that is not a header is a
  // failure rather than something to skip over.
  if (!HEADER_BLOCK_REGEXP.test(headers)) {
    throw new Error(`Unexpected bytes on stdout before a message: ${JSON.stringify(headers)}.`);
  }

  const contentLength = CONTENT_LENGTH_REGEXP.exec(headers);
  if (!contentLength) {
    throw new Error(`Missing Content-Length header in "${headers}".`);
  }

  const bodyStart = headerEnd + 4;
  const bodyEnd = bodyStart + Number(contentLength[1]);
  if (buffer.length < bodyEnd) {
    return undefined;
  }

  return {
    message: JSON.parse(buffer.subarray(bodyStart, bodyEnd).toString('utf8')) as JsonRpcMessage,
    rest: buffer.subarray(bodyEnd),
  };
};

/** Speaks JSON-RPC over stdio with a `rs fmt --lsp` process. */
export const startLspServer = (cwd: string, args: string[] = []): LspClient => {
  const childProcess: ChildProcessWithoutNullStreams = spawn(
    process.execPath,
    [RSTACK_BIN_PATH, 'fmt', '--lsp', ...args],
    { cwd, env: createCliEnv(), stdio: 'pipe' },
  );
  let exitCode: number | null | undefined;

  const pending = new Map<
    number,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >();
  let nextId = 0;
  let buffer: Buffer = Buffer.alloc(0);
  let stderr = '';
  let failure: Error | undefined;
  const shownMessages: ShownMessage[] = [];

  const fail = (error: Error): void => {
    failure = error;
    for (const { reject } of pending.values()) {
      reject(error);
    }
    pending.clear();
  };

  childProcess.stdout.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    try {
      let next = readMessage(buffer);
      while (next) {
        buffer = next.rest;
        const { id, error, method, params, result } = next.message;
        if (method === 'window/showMessage') {
          shownMessages.push(params as ShownMessage);
        }
        const handlers = id === undefined ? undefined : pending.get(id);
        if (id !== undefined && handlers) {
          pending.delete(id);
          if (error) {
            handlers.reject(new Error(`${error.message} (${error.code})`));
          } else {
            handlers.resolve(result);
          }
        }
        next = readMessage(buffer);
      }
    } catch (error) {
      fail(error as Error);
    }
  });
  childProcess.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  const closed = new Promise<number | null>((resolve) => {
    childProcess.once('close', (code) => {
      exitCode = code;
      fail(new Error(`The language server exited with code ${code}.\n${stderr}`));
      resolve(code);
    });
  });

  const send = (message: Record<string, unknown>): void => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8');
    childProcess.stdin.write(`Content-Length: ${body.byteLength}\r\n\r\n`);
    childProcess.stdin.write(body);
  };

  const request = <Result>(method: string, params: unknown): Promise<Result> => {
    if (failure) {
      return Promise.reject(failure);
    }

    const id = nextId++;

    return new Promise<Result>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (result: unknown) => void, reject });
      send({ id, method, params });
    });
  };

  const notify = (method: string, params: unknown): void => {
    send({ method, params });
  };

  return {
    notify,
    initialize: (root = cwd) =>
      request('initialize', {
        processId: null,
        rootUri: toFileUri(root),
        capabilities: {},
        workspaceFolders: [{ uri: toFileUri(root), name: 'fixture' }],
      }),
    openDocument: (uri, languageId, text) => {
      notify('textDocument/didOpen', {
        textDocument: { uri, languageId, version: 1, text },
      });
    },
    formatDocument: (uri) =>
      request('textDocument/formatting', {
        textDocument: { uri },
        options: { tabSize: 2, insertSpaces: true },
      }),
    shownMessages: () => shownMessages,
    stop: async () => {
      if (exitCode === undefined) {
        await request('shutdown', null);
        notify('exit', null);
      }

      return closed;
    },
    stderr: () => stderr,
  };
};
