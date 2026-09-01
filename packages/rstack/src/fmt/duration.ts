/** Formats sub-second durations in milliseconds and preserves the existing longer-duration format. */
const formatDuration = (milliseconds: number): string => {
  if (milliseconds < 1) {
    return '<1ms';
  }

  const roundedMilliseconds = Math.round(milliseconds);
  if (roundedMilliseconds < 1000) {
    return `${roundedMilliseconds}ms`;
  }

  const seconds = milliseconds / 1000;
  if (seconds < 10) {
    return `${seconds.toFixed(2)}s`;
  }

  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }

  const secondsLabel = remainingSeconds.toFixed(
    remainingSeconds % 1 === 0 ? 0 : 1,
  );
  return `${minutes}m ${secondsLabel}s`;
};

export { formatDuration };
