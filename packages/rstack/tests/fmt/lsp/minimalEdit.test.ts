import { expect, test } from 'rstack/test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { computeMinimalEdit } from '../../../src/fmt/lsp/minimalEdit.ts';

/** Applies an edit the way an editor does, to prove it rewrites the document. */
const applyMinimalEdit = (source: string, formatted: string): string => {
  const edit = computeMinimalEdit(source, formatted);
  if (!edit) {
    return source;
  }

  return source.slice(0, edit.start) + edit.newText + source.slice(edit.end);
};

/**
 * Applies an edit through a real `TextDocument`, the way a conformant client
 * does: offsets become positions on the server and positions become offsets
 * again on the client, which moves any offset that lands inside a `\r\n`.
 */
const applyMinimalEditThroughPositions = (source: string, formatted: string): string => {
  const edit = computeMinimalEdit(source, formatted);
  if (!edit) {
    return source;
  }

  const document = TextDocument.create('file:///a.ts', 'typescript', 1, source);
  const start = document.offsetAt(document.positionAt(edit.start));
  const end = document.offsetAt(document.positionAt(edit.end));

  // A round trip through positions must not move either boundary.
  expect([start, end]).toEqual([edit.start, edit.end]);

  return source.slice(0, start) + edit.newText + source.slice(end);
};

test('returns no edit for identical sources', () => {
  expect(computeMinimalEdit('', '')).toBeUndefined();
  expect(computeMinimalEdit('const x = 1;\n', 'const x = 1;\n')).toBeUndefined();
});

test('replaces the whole document when nothing is shared', () => {
  expect(computeMinimalEdit('', 'const x = 1;\n')).toEqual({
    start: 0,
    end: 0,
    newText: 'const x = 1;\n',
  });
  expect(computeMinimalEdit('a\n', '')).toEqual({ start: 0, end: 2, newText: '' });
});

test('trims a shared prefix', () => {
  expect(computeMinimalEdit('const x = 1\n', 'const x = 1;\n')).toEqual({
    start: 11,
    end: 11,
    newText: ';',
  });
});

test('trims a shared suffix', () => {
  expect(computeMinimalEdit('  const x = 1;\n', 'const x = 1;\n')).toEqual({
    start: 0,
    end: 2,
    newText: '',
  });
});

test('trims both ends around a change in the middle', () => {
  const source = 'const a = 1;\nconst b=2;\nconst c = 3;\n';
  const formatted = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';

  expect(computeMinimalEdit(source, formatted)).toEqual({
    start: 20,
    end: 21,
    newText: ' = ',
  });
  expect(applyMinimalEdit(source, formatted)).toBe(formatted);
});

test('replaces the whole line break when a carriage return is removed', () => {
  const edit = computeMinimalEdit('a\r\nb\r\n', 'a\nb\n');

  // Deleting only the carriage return would place the range inside a `\r\n`.
  expect(edit).toEqual({ start: 1, end: 6, newText: '\nb\n' });
  expect(applyMinimalEdit('a\r\nb\r\n', 'a\nb\n')).toBe('a\nb\n');
});

test('replaces the whole line break when a carriage return is added', () => {
  const edit = computeMinimalEdit('a\nb\n', 'a\r\nb\r\n');

  // Inserting a lone carriage return before an existing `\n` is not addressable.
  expect(edit).toEqual({ start: 1, end: 4, newText: '\r\nb\r\n' });
  expect(applyMinimalEdit('a\nb\n', 'a\r\nb\r\n')).toBe('a\r\nb\r\n');
});

test('keeps matching carriage returns out of the edit', () => {
  const source = 'const a=1;\r\nconst b = 2;\r\n';
  const formatted = 'const a = 1;\r\nconst b = 2;\r\n';

  expect(computeMinimalEdit(source, formatted)).toEqual({
    start: 7,
    end: 8,
    newText: ' = ',
  });
  expect(applyMinimalEdit(source, formatted)).toBe(formatted);
});

test('keeps the edit on code point boundaries', () => {
  const source = 'const a = "🙂";\n';
  const formatted = 'const a = "😀";\n';
  const edit = computeMinimalEdit(source, formatted);

  expect(edit).toEqual({ start: 11, end: 13, newText: '😀' });
  expect(source.slice(edit?.start, edit?.end)).toBe('🙂');
  expect(applyMinimalEdit(source, formatted)).toBe(formatted);
});

test('trims around multibyte characters', () => {
  const source = "const emoji='🙂 ok';\n";
  const formatted = 'const emoji = "🙂 ok";\n';

  expect(applyMinimalEdit(source, formatted)).toBe(formatted);
});

test('keeps the edit off the line feed of a `\\r\\n`', () => {
  // The lone carriage return makes the loops meet between `\r` and `\n`, and an
  // offset there is pulled back to the `\r` by the client, voiding the edit.
  const edit = computeMinimalEdit('a\r\r\n', 'a\r\n');

  expect(edit).toEqual({ start: 2, end: 4, newText: '\n' });
  expect(applyMinimalEditThroughPositions('a\r\r\n', 'a\r\n')).toBe('a\r\n');
});

test('survives a round trip through a real text document', () => {
  const source = 'const a=1;\r\nconst b = 2;\r\n';
  const formatted = 'const a = 1;\r\nconst b = 2;\r\n';

  expect(applyMinimalEditThroughPositions(source, formatted)).toBe(formatted);
  expect(applyMinimalEditThroughPositions('a\nb\n', 'a\r\nb\r\n')).toBe('a\r\nb\r\n');
  expect(applyMinimalEditThroughPositions('a\r\nb\r\n', 'a\nb\n')).toBe('a\nb\n');
});

// Line terminators are where offsets stop being interchangeable with positions,
// so every combination of them up to a length no editor would ever hit is
// checked rather than a hand-picked few.
test('addresses every combination of line terminators', () => {
  const alphabet = ['a', '\r', '\n'];
  const texts: string[] = [''];
  let current = [''];
  for (let length = 0; length < 5; length++) {
    current = current.flatMap((text) => alphabet.map((character) => text + character));
    texts.push(...current);
  }

  const failures: string[] = [];
  for (const source of texts) {
    const document = TextDocument.create('file:///a.ts', 'typescript', 1, source);
    for (const formatted of texts) {
      const edit = computeMinimalEdit(source, formatted);
      if (!edit) {
        continue;
      }

      const start = document.offsetAt(document.positionAt(edit.start));
      const end = document.offsetAt(document.positionAt(edit.end));
      const applied = source.slice(0, start) + edit.newText + source.slice(end);
      if (applied !== formatted) {
        failures.push(`${JSON.stringify(source)} -> ${JSON.stringify(formatted)}`);
      }
    }
  }

  expect(failures).toEqual([]);
});

// U+2028 ends a line for JavaScript but never for the protocol.
test('treats a line separator as ordinary content', () => {
  const source = 'const a = "\u2028";\nconst b=2;\n';
  const formatted = 'const a = "\u2028";\nconst b = 2;\n';

  expect(computeMinimalEdit(source, formatted)).toEqual({
    start: 22,
    end: 23,
    newText: ' = ',
  });
  expect(applyMinimalEdit(source, formatted)).toBe(formatted);
});
