#!/usr/bin/env node
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { discoverFmtPaths } from '../packages/rstack/src/fmt/discoverPaths.ts';

const usage = `Usage:
  pnpm benchmark:fmt-discovery -- [options]

Build the optimized native binding before recording comparison data:
  pnpm --filter rstack build:native:release

Options:
  --cwd <path>              Directory used to resolve inputs (default: current directory)
  --pattern <path-or-glob>  Input path or glob; may be repeated
  --explicit-count <count>  Benchmark the first N discovered files as explicit inputs
  --warmup <count>          Warmup runs excluded from timing (default: 5)
  --runs <count>            Number of measured runs (default: 30)
  -h, --help                Display this help message
`;

const readValue = (args, index, flag) => {
  const value = args[index + 1];
  if (value === undefined) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
};

const parseInteger = (value, flag, minimum) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum) {
    throw new Error(`${flag} must be an integer greater than or equal to ${minimum}.`);
  }
  return result;
};

const parseArgs = (args) => {
  const options = {
    cwd: process.cwd(),
    explicitCount: undefined,
    patterns: [],
    runs: 30,
    warmup: 5,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    switch (arg) {
      case '--':
        break;
      case '--cwd':
        options.cwd = readValue(args, index, arg);
        index++;
        break;
      case '--pattern':
        options.patterns.push(readValue(args, index, arg));
        index++;
        break;
      case '--explicit-count':
        options.explicitCount = parseInteger(readValue(args, index, arg), arg, 1);
        index++;
        break;
      case '--runs':
        options.runs = parseInteger(readValue(args, index, arg), arg, 1);
        index++;
        break;
      case '--warmup':
        options.warmup = parseInteger(readValue(args, index, arg), arg, 0);
        index++;
        break;
      case '-h':
      case '--help':
        process.stdout.write(usage);
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.explicitCount !== undefined && options.patterns.length > 0) {
    throw new Error('--explicit-count cannot be combined with --pattern.');
  }
  return options;
};

const percentile = (sortedValues, ratio) => {
  const position = (sortedValues.length - 1) * ratio;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];
  return lower + (upper - lower) * (position - lowerIndex);
};

const roundMilliseconds = (value) => Math.round(value * 1000) / 1000;

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const cwd = path.resolve(options.cwd);
  const cwdStats = await stat(cwd);
  if (!cwdStats.isDirectory()) {
    throw new Error(`Benchmark cwd is not a directory: ${cwd}`);
  }

  let patterns = options.patterns.length > 0 ? options.patterns : undefined;
  let mode = patterns ? 'patterns' : 'directory';
  if (options.explicitCount !== undefined) {
    const discovered = await discoverFmtPaths({ cwd });
    if (discovered.length < options.explicitCount) {
      throw new Error(
        `Only ${discovered.length} files were discovered; cannot select ${options.explicitCount}.`,
      );
    }
    patterns = discovered.slice(0, options.explicitCount);
    mode = 'explicit';
  }

  let expectedFileCount;
  const runOnce = async () => {
    const startTime = performance.now();
    const files = await discoverFmtPaths({ cwd, patterns });
    const duration = performance.now() - startTime;
    expectedFileCount ??= files.length;
    if (files.length !== expectedFileCount) {
      throw new Error(
        `Discovered file count changed between runs: ${expectedFileCount} -> ${files.length}.`,
      );
    }
    return duration;
  };

  for (let index = 0; index < options.warmup; index++) {
    await runOnce();
  }

  const durations = [];
  for (let index = 0; index < options.runs; index++) {
    durations.push(await runOnce());
  }
  durations.sort((left, right) => left - right);

  process.stdout.write(
    `${JSON.stringify(
      {
        cwd,
        mode,
        patternCount: patterns?.length ?? 0,
        fileCount: expectedFileCount,
        warmup: options.warmup,
        runs: options.runs,
        medianMs: roundMilliseconds(percentile(durations, 0.5)),
        p95Ms: roundMilliseconds(percentile(durations, 0.95)),
      },
      undefined,
      2,
    )}\n`,
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
