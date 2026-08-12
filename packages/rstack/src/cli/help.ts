export const hasHelpFlag = (args: readonly string[]): boolean => {
  const end = args.indexOf('--');
  const flags = end === -1 ? args : args.slice(0, end);

  return flags.some((flag) => flag === '-h' || flag === '--help');
};

export const printCommandHelp = async (
  topic: import('./commandHelp.ts').HelpTopic,
): Promise<void> => {
  const { renderCommandHelp } = await import(
    /* rspackChunkName: 'commandHelp' */
    './commandHelp.ts'
  );
  console.log(renderCommandHelp(topic));
};
