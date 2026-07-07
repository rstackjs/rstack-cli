import { parseArgs } from 'node:util';

type ParsedRstackArgs = {
  args: string[];
  configPath?: string;
};

export function parseCliArgs(args: string[]): ParsedRstackArgs {
  const { tokens } = parseArgs({
    args,
    options: {
      config: { type: 'string', short: 'c' },
    },
    strict: false,
    allowPositionals: true,
    tokens: true,
  });

  let removedIndexes: number[] | undefined;
  let configPath: string | undefined;

  for (const token of tokens) {
    if (token.kind === 'option-terminator') {
      break;
    }

    // parseArgs expands short option groups like `-abc`; only consume `-c` when it starts the raw arg.
    if (
      token.kind !== 'option' ||
      token.name !== 'config' ||
      (token.rawName === '-c' && !args[token.index].startsWith('-c'))
    ) {
      continue;
    }

    if (token.value === undefined || token.value.length === 0) {
      throw new Error(`Missing value for ${token.rawName}.`);
    }

    configPath = token.value;
    const indexes = (removedIndexes ??= []);
    indexes.push(token.index);

    if (!token.inlineValue) {
      indexes.push(token.index + 1);
    }
  }

  if (!removedIndexes) {
    return { args };
  }

  return {
    args: args.filter((_, index) => !removedIndexes.includes(index)),
    configPath,
  };
}

export function insertConfigArg(args: string[], option: string, configPath: string): string[] {
  // Keep the injected config before `--`; arguments after it must remain positional for the child CLI.
  const terminatorIndex = args.indexOf('--');

  if (terminatorIndex === -1) {
    return [...args, option, configPath];
  }

  return [...args.slice(0, terminatorIndex), option, configPath, ...args.slice(terminatorIndex)];
}
