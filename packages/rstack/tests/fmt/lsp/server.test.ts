import { expect, test } from 'rstack/test';
import { createDocumentEdits } from '../../../src/fmt/lsp/server.ts';

test('maps the edit onto the formatted document', async () => {
  const edits = await createDocumentEdits(
    () => 'const a = 1;\nconst b=2;\n',
    () => Promise.resolve('const a = 1;\nconst b = 2;\n'),
  );

  expect(edits).toEqual([
    {
      range: {
        start: { line: 1, character: 7 },
        end: { line: 1, character: 8 },
      },
      newText: ' = ',
    },
  ]);
});

test('returns no edits for an already formatted document', async () => {
  const getText = () => 'const a = 1;\n';

  expect(
    await createDocumentEdits(getText, () => Promise.resolve('const a = 1;\n')),
  ).toEqual([]);
  expect(
    await createDocumentEdits(getText, () => Promise.resolve(undefined)),
  ).toEqual([]);
});

test('returns no edits for a document that is not open', async () => {
  expect(
    await createDocumentEdits(
      () => undefined,
      () => Promise.resolve(''),
    ),
  ).toEqual([]);
});

// The client can replace the buffer while the formatter runs; an edit computed
// from the old text must not reach the new one.
test('returns no edits when the document changes while it is formatted', async () => {
  let text = 'const a = 1;\nconst b=2;\n';

  const edits = await createDocumentEdits(
    () => text,
    (source) => {
      text = 'const b=2;\n';

      return Promise.resolve(source.replace('const b=2;', 'const b = 2;'));
    },
  );

  // Without the staleness check this returns an edit for line 1, which the
  // shortened buffer no longer holds.
  expect(edits).toEqual([]);
});
