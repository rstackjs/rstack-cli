const formatSeconds = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000);
  const remainder = milliseconds % 1000;

  if (remainder === 0) {
    return `${seconds}s`;
  }

  const fraction = remainder.toString().padStart(3, '0').replace(/0+$/, '');
  return `${seconds}.${fraction}s`;
};

/** Formats a duration after rounding to millisecond precision. */
const formatDuration = (milliseconds: number): string => {
  if (milliseconds < 1) {
    return '<1ms';
  }

  const roundedMilliseconds = Math.round(milliseconds);
  if (roundedMilliseconds < 1000) {
    return `${roundedMilliseconds}ms`;
  }

  const hours = Math.floor(roundedMilliseconds / 3_600_000);
  const minutes = Math.floor(roundedMilliseconds / 60_000) % 60;
  const seconds = formatSeconds(roundedMilliseconds % 60_000);

  if (hours > 0) {
    return `${hours}h${minutes}m${seconds}`;
  }

  return minutes > 0 ? `${minutes}m${seconds}` : seconds;
};

export { formatDuration };
