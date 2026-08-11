import { expect, test } from 'rstack/test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createDocumentEdits } from '../../../src/fmt/lsp/server.ts';

const createDocument = (text: string): TextDocument =>
  TextDocument.create('file:///src/index.ts', 'typescript', 1, text);

test('maps the edit onto the formatted document', async () => {
  const document = createDocument('const a = 1;\nconst b=2;\n');

  const edits = await createDocumentEdits(document, async () => 'const a = 1;\nconst b = 2;\n');

  expect(edits).toEqual([
    {
      range: { start: { line: 1, character: 7 }, end: { line: 1, character: 8 } },
      newText: ' = ',
    },
  ]);
});

test('returns no edits for an already formatted document', async () => {
  const document = createDocument('const a = 1;\n');

  expect(await createDocumentEdits(document, async () => 'const a = 1;\n')).toEqual([]);
  expect(await createDocumentEdits(document, async () => undefined)).toEqual([]);
});

// `TextDocuments` mutates the document in place, so a change arriving while the
// formatter runs would otherwise be mapped through the new line table.
test('returns no edits when the document changes while it is formatted', async () => {
  const document = createDocument('const a = 1;\nconst b=2;\n');

  const edits = await createDocumentEdits(document, async (source) => {
    TextDocument.update(document, [{ text: 'const b=2;\n' }], 2);

    return source.replace('const b=2;', 'const b = 2;');
  });

  // Without the version check this returns an edit for line 1, which the
  // shortened buffer no longer holds.
  expect(edits).toEqual([]);
});
