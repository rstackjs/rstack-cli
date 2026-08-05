import {
  parseArgs as nodeParseArgs,
  type ParseArgsConfig,
  type ParseArgsOptionsConfig,
} from 'node:util';

type CamelCase<Value extends string> = Value extends `${infer Head}-${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : Value;

type NodeParseArgsResult<Config extends ParseArgsConfig> = ReturnType<typeof nodeParseArgs<Config>>;

type ParseArgsResult<Config extends ParseArgsConfig> = Omit<
  NodeParseArgsResult<Config>,
  'values'
> & {
  values: {
    [
      Name in keyof NodeParseArgsResult<Config>['values'] as CamelCase<Name & string>
    ]: NodeParseArgsResult<Config>['values'][Name];
  };
};

const KEBAB_CASE_REGEXP = /-([a-z])/g;

const toCamelCase = (value: string): string =>
  value.includes('-')
    ? value.replace(KEBAB_CASE_REGEXP, (_, character: string) => character.toUpperCase())
    : value;

export function parseArgs<const Config extends ParseArgsConfig = ParseArgsConfig>(
  config?: Config,
): ParseArgsResult<Config> {
  const options: ParseArgsOptionsConfig = {};
  const optionNames: [originalName: string, camelName: string][] = [];

  for (const [originalName, descriptor] of Object.entries(config?.options ?? {})) {
    const camelName = toCamelCase(originalName);
    optionNames.push([originalName, camelName]);
    options[originalName] = descriptor;

    if (camelName !== originalName) {
      options[camelName] = descriptor;
    }
  }

  const parsed = nodeParseArgs({
    ...config,
    options,
  });
  const values: Record<string, unknown> = {};

  for (const [originalName, camelName] of optionNames) {
    const originalValue = parsed.values[originalName];
    const camelValue = camelName === originalName ? undefined : parsed.values[camelName];
    const value =
      Array.isArray(originalValue) && Array.isArray(camelValue)
        ? [...originalValue, ...camelValue]
        : (originalValue ?? camelValue);

    if (value !== undefined) {
      values[camelName] = value;
    }
  }

  return {
    ...parsed,
    values,
  } as unknown as ParseArgsResult<Config>;
}

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
