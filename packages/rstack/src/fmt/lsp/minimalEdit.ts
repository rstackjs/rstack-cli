/** A replacement expressed as UTF-16 offsets into the original source. */
interface MinimalEdit {
  start: number;
  end: number;
  newText: string;
}

const CARRIAGE_RETURN = 0x0d;
const LINE_FEED = 0x0a;

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/**
 * True when `index` splits a unit that occupies a single position: a surrogate
 * pair or a `\r\n`. Offsets on such an index do not survive the offset →
 * position → offset round trip conformant clients apply, so a range boundary
 * must never land there.
 */
const splitsIndivisibleUnit = (text: string, index: number): boolean => {
  const code = text.charCodeAt(index);

  return (
    (isLowSurrogate(code) && isHighSurrogate(text.charCodeAt(index - 1))) ||
    (code === LINE_FEED && text.charCodeAt(index - 1) === CARRIAGE_RETURN)
  );
};

/**
 * Reduces a reformat to the single range that actually changed.
 *
 * Editors apply the result to a live buffer, so the edit is trimmed on both
 * ends instead of replacing the whole document, which keeps selections, folds,
 * and undo history intact. Offsets are converted to positions by the caller.
 */
const computeMinimalEdit = (source: string, formatted: string): MinimalEdit | undefined => {
  if (source === formatted) {
    return undefined;
  }

  // Everything before the first difference is identical on both sides, so the
  // line terminators cannot disagree here.
  let prefixLength = 0;
  const maxPrefixLength = Math.min(source.length, formatted.length);
  while (
    prefixLength < maxPrefixLength &&
    source.charCodeAt(prefixLength) === formatted.charCodeAt(prefixLength)
  ) {
    prefixLength++;
  }

  let suffixLength = 0;
  const maxSuffixLength = maxPrefixLength - prefixLength;
  while (suffixLength < maxSuffixLength) {
    const sourceIndex = source.length - suffixLength - 1;
    const formattedIndex = formatted.length - suffixLength - 1;
    const code = source.charCodeAt(sourceIndex);
    if (code !== formatted.charCodeAt(formattedIndex)) {
      break;
    }

    // Stop before a line feed whose carriage return only exists on one side,
    // so the edit replaces the whole terminator instead of inserting a lone
    // `\r`. This handles the two sides disagreeing; boundaries landing inside
    // a `\r\n` on the source side are widened below.
    if (
      code === LINE_FEED &&
      (source.charCodeAt(sourceIndex - 1) === CARRIAGE_RETURN) !==
        (formatted.charCodeAt(formattedIndex - 1) === CARRIAGE_RETURN)
    ) {
      break;
    }

    suffixLength++;
  }

  // Widen both ends off any index that splits an indivisible unit; conformant
  // clients move such offsets, which would shrink or void the range.
  while (splitsIndivisibleUnit(source, prefixLength)) {
    prefixLength--;
  }
  while (splitsIndivisibleUnit(source, source.length - suffixLength)) {
    suffixLength--;
  }

  return {
    start: prefixLength,
    end: source.length - suffixLength,
    newText: formatted.slice(prefixLength, formatted.length - suffixLength),
  };
};

export { computeMinimalEdit };
export type { MinimalEdit };
