import { expect, test } from 'rstack/test';
import { setupFmtTest } from './helpers.ts';
import { applyTextEdits, type LspClient, startLspServer, toFileUri } from './lspClient.ts';

const { resolveProjectPath, runFmt, writeProjectFile } = setupFmtTest();

const TEST_TIMEOUT = 30_000;

/** Spawn options for the cases where the server is not launched from the project root. */
type LspServerOptions = {
  /** Directory the server process is spawned in; defaults to the project root. */
  cwd?: string;
  /** Extra `rs fmt` arguments. */
  args?: string[];
};

const withLspServer = async (
  run: (client: LspClient) => Promise<void>,
  { cwd, args }: LspServerOptions = {},
): Promise<void> => {
  const client = startLspServer(cwd ?? resolveProjectPath('.'), args);

  try {
    await run(client);
  } finally {
    await client.stop();
  }
};

const openDocument = (client: LspClient, filePath: string, text: string): string => {
  const uri = toFileUri(resolveProjectPath(filePath));
  client.openDocument(uri, 'typescript', text);

  return uri;
};

/** Creates an empty directory to launch the server from, standing in for an editor's cwd. */
const createLaunchDir = (): string => {
  writeProjectFile('launcher/.keep', '');

  return resolveProjectPath('launcher');
};

test(
  'advertises document formatting only',
  async () => {
    await withLspServer(async (client) => {
      const { capabilities } = await client.initialize();

      expect(capabilities.documentFormattingProvider).toBe(true);
      // Full document sync; without a sync capability compliant clients would
      // never send the document.
      expect(capabilities.textDocumentSync).toBe(1);
      expect(capabilities.documentRangeFormattingProvider).toBeUndefined();
      expect(capabilities.documentOnTypeFormattingProvider).toBeUndefined();
    });
  },
  TEST_TIMEOUT,
);

test(
  'formats an open document',
  async () => {
    await withLspServer(async (client) => {
      await client.initialize();
      const source = 'const x=1\n';
      const uri = openDocument(client, 'src/index.ts', source);

      const edits = await client.formatDocument(uri);

      expect(edits.length).toBe(1);
      expect(applyTextEdits(source, edits)).toBe('const x = 1;\n');
    });
  },
  TEST_TIMEOUT,
);

test(
  'formats the in-memory buffer instead of the file on disk',
  async () => {
    writeProjectFile('src/index.ts', 'const onDisk = "disk";\n');

    await withLspServer(async (client) => {
      await client.initialize();
      const source = 'const inBuffer="buffer"\n';
      const uri = openDocument(client, 'src/index.ts', source);

      const edits = await client.formatDocument(uri);

      expect(applyTextEdits(source, edits)).toBe('const inBuffer = "buffer";\n');
    });
  },
  TEST_TIMEOUT,
);

test(
  'formats changes sent by the client',
  async () => {
    await withLspServer(async (client) => {
      await client.initialize();
      const uri = openDocument(client, 'src/index.ts', 'const x = 1;\n');
      // Full document sync: the change carries the whole new buffer.
      client.notify('textDocument/didChange', {
        textDocument: { uri, version: 2 },
        contentChanges: [{ text: 'const x=2;\n' }],
      });

      const edits = await client.formatDocument(uri);

      expect(applyTextEdits('const x=2;\n', edits)).toBe('const x = 2;\n');
    });
  },
  TEST_TIMEOUT,
);

test(
  'applies define.fmt options and overrides',
  async () => {
    writeProjectFile(
      'rstack.config.ts',
      `import { define } from 'rstack';

define.fmt({
  singleQuote: true,
  overrides: [
    {
      files: '*.test.ts',
      options: {
        semi: false,
      },
    },
  ],
});
`,
    );

    await withLspServer(async (client) => {
      await client.initialize();
      const source = 'const test="test"\n';
      const uri = openDocument(client, 'src/index.test.ts', source);

      const edits = await client.formatDocument(uri);

      expect(applyTextEdits(source, edits)).toBe("const test = 'test'\n");
    });
  },
  TEST_TIMEOUT,
);

test(
  'keeps stdout clean when the config writes to the console',
  async () => {
    writeProjectFile(
      'rstack.config.ts',
      `import { define } from 'rstack';

console.log('hello from config');
// Bypasses a patched \`console.log\`, so it needs its own reroute.
console.dirxml('xml from config');

define.fmt({ singleQuote: true });
`,
    );

    await withLspServer(async (client) => {
      await client.initialize();
      const source = 'const x="log"\n';
      const uri = openDocument(client, 'src/index.ts', source);

      // Raw bytes from the config would have broken the framing parser well
      // before this resolves.
      const edits = await client.formatDocument(uri);

      expect(applyTextEdits(source, edits)).toBe("const x = 'log';\n");
    });
  },
  TEST_TIMEOUT,
);

test(
  'loads the config from the workspace root instead of the process cwd',
  async () => {
    writeProjectFile(
      'rstack.config.ts',
      `import { define } from 'rstack';

define.fmt({ singleQuote: true });
`,
    );
    const launchDir = createLaunchDir();

    await withLspServer(
      async (client) => {
        // The launch directory holds no config, so double quotes here would mean
        // the server resolved the config from its own cwd instead of the root.
        await client.initialize(resolveProjectPath('.'));
        const source = 'const value = "root"\n';
        const uri = openDocument(client, 'src/index.ts', source);

        const edits = await client.formatDocument(uri);

        expect(applyTextEdits(source, edits)).toBe("const value = 'root';\n");
      },
      { cwd: launchDir },
    );
  },
  TEST_TIMEOUT,
);

test(
  'resolves a relative --config path from the process cwd',
  async () => {
    writeProjectFile(
      'rstack.config.ts',
      `import { define } from 'rstack';

define.fmt({ singleQuote: true });
`,
    );
    const launchDir = createLaunchDir();
    writeProjectFile(
      'launcher/custom.config.ts',
      `import { define } from 'rstack';

define.fmt({ semi: false });
`,
    );

    await withLspServer(
      async (client) => {
        await client.initialize(resolveProjectPath('.'));
        const source = 'const value="cli"\n';
        const uri = openDocument(client, 'src/index.ts', source);

        const edits = await client.formatDocument(uri);

        // `semi: false` from the CLI config, not `singleQuote: true` from the root.
        expect(applyTextEdits(source, edits)).toBe('const value = "cli"\n');
      },
      { cwd: launchDir, args: ['--config', './custom.config.ts'] },
    );
  },
  TEST_TIMEOUT,
);

test(
  'resolves a relative --ignore-path from the process cwd',
  async () => {
    writeProjectFile('fmt.ignore', 'src/ignored.ts\n');
    const launchDir = createLaunchDir();

    await withLspServer(
      async (client) => {
        await client.initialize(resolveProjectPath('.'));
        const ignoredUri = openDocument(client, 'src/ignored.ts', 'const ignored="ignored"\n');
        const formattedUri = openDocument(client, 'src/index.ts', 'const x=1\n');

        expect(await client.formatDocument(ignoredUri)).toEqual([]);
        // The ignore file was read rather than reported as missing.
        expect((await client.formatDocument(formattedUri)).length).toBe(1);
        expect(client.shownMessages()).toEqual([]);
      },
      { cwd: launchDir, args: ['--ignore-path', '../fmt.ignore'] },
    );
  },
  TEST_TIMEOUT,
);

test(
  'reports an unreadable --ignore-path to the editor',
  async () => {
    await withLspServer(
      async (client) => {
        await client.initialize();
        const uri = openDocument(client, 'src/index.ts', 'const x=1\n');

        expect(await client.formatDocument(uri)).toEqual([]);

        const messages = client.shownMessages();
        expect(messages.length).toBe(1);
        // Type 1 is MessageType.Error.
        expect(messages[0].type).toBe(1);
        expect(messages[0].message).toContain('Failed to read ignore file');
      },
      { args: ['--ignore-path', 'missing.ignore'] },
    );
  },
  TEST_TIMEOUT,
);

test(
  'returns no edits for a formatted document',
  async () => {
    await withLspServer(async (client) => {
      await client.initialize();
      const uri = openDocument(client, 'src/index.ts', 'const x = 1;\n');

      expect(await client.formatDocument(uri)).toEqual([]);
    });
  },
  TEST_TIMEOUT,
);

test(
  'returns no edits for an unparsable document',
  async () => {
    await withLspServer(async (client) => {
      await client.initialize();
      const uri = openDocument(client, 'src/index.ts', 'const value = ;\n');

      expect(await client.formatDocument(uri)).toEqual([]);
      // The server stays usable after a parse error.
      const validUri = openDocument(client, 'src/valid.ts', 'const x=1\n');
      expect((await client.formatDocument(validUri)).length).toBe(1);
    });
  },
  TEST_TIMEOUT,
);

test(
  'returns no edits for ignored documents',
  async () => {
    writeProjectFile(
      'rstack.config.ts',
      `import { define } from 'rstack';

define.fmt({ ignorePatterns: ['src/ignored.ts'] });
`,
    );

    await withLspServer(async (client) => {
      await client.initialize();
      const uri = openDocument(client, 'src/ignored.ts', 'const ignored="ignored"\n');

      expect(await client.formatDocument(uri)).toEqual([]);
    });
  },
  TEST_TIMEOUT,
);

test(
  'returns no edits for unknown file types',
  async () => {
    await withLspServer(async (client) => {
      await client.initialize();
      const uri = openDocument(client, 'data.unknown', 'value\n');

      expect(await client.formatDocument(uri)).toEqual([]);
    });
  },
  TEST_TIMEOUT,
);

test(
  'exits after the shutdown handshake',
  async () => {
    const client = startLspServer(resolveProjectPath('.'));
    await client.initialize();

    expect(await client.stop()).toBe(0);
    expect(client.stderr()).toBe('');
  },
  TEST_TIMEOUT,
);

test.each(['--write', '--check', '--list-different'])(
  'returns exit code 2 for %s with --lsp',
  (option) => {
    const result = runFmt(['--lsp', option]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      'The --lsp option cannot be used with --write, --check, or --list-different.',
    );
  },
);

test('returns exit code 2 for file arguments with --lsp', () => {
  const result = runFmt(['--lsp', 'src/index.ts']);

  expect(result.status).toBe(2);
  expect(result.stderr).toContain('The --lsp option cannot be used with file arguments.');
});

test('returns exit code 2 for --stdin-filepath with --lsp', () => {
  const result = runFmt(['--lsp', '--stdin-filepath', 'src/index.ts']);

  expect(result.status).toBe(2);
  expect(result.stderr).toContain('The --lsp option cannot be used with --stdin-filepath.');
});
