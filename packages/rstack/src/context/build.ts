import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  ConfigParams,
  EnvironmentContext,
  OnAfterEnvironmentCompileFn,
  OnBeforeBuildFn,
  RsbuildConfig,
  RsbuildPlugin,
} from '@rsbuild/core';
import {
  contextStoreSchemaVersion,
  type BuildMetadataFacet,
  type ContextDescriptor,
  type ContextRunManifest,
  type ContextSnapshot,
  type ContextStoreWriteResult,
} from './model.ts';
import { writeContextRunManifest, writeContextSnapshot } from './store.ts';
import type { ResolvedContextWorkspace } from './workspace.ts';

type BuildContextPluginOptions = {
  producer: 'rsbuild' | 'rslib';
  product: 'application' | 'library';
  capture: 'metadata' | 'deep';
  workspace: ResolvedContextWorkspace;
  configPath?: string;
  params: ConfigParams;
  createRunId?: () => string;
  now?: () => Date;
};

const normalizeWorkspacePath = (workspaceRoot: string, value: string): string =>
  path.relative(workspaceRoot, value).split(path.sep).join('/') || '.';

const getTarget = (environment: EnvironmentContext): string => environment.config.output.target;

const getMode = (params: ConfigParams): string => params.envMode ?? params.env;

const normalizeMetadataPath = (workspaceRoot: string, value: string): string =>
  path.posix.normalize(
    path.isAbsolute(value)
      ? normalizeWorkspacePath(workspaceRoot, value)
      : value.split(path.sep).join('/').replaceAll('\\', '/'),
  );

const buildMetadataFacet = ({
  options,
  environment,
  isFirstCompile,
  isWatch,
  stats,
  time,
}: {
  options: BuildContextPluginOptions;
  environment: EnvironmentContext;
  isFirstCompile: boolean;
  isWatch: boolean;
  stats: NonNullable<Parameters<OnAfterEnvironmentCompileFn>[0]['stats']>;
  time: number;
}): BuildMetadataFacet => {
  const json = stats.toJson({
    all: false,
    hash: true,
    assets: true,
    chunks: true,
    errors: false,
    warnings: false,
  }) as {
    assets?: Array<{ name?: unknown; size?: unknown }>;
    chunks?: Array<{ files?: unknown; id?: unknown; initial?: unknown }>;
    hash?: unknown;
  };
  const assets: BuildMetadataFacet['assets'] = [];
  let droppedAssets = 0;
  for (const asset of json.assets ?? []) {
    if (typeof asset.name !== 'string' || typeof asset.size !== 'number') {
      continue;
    }
    const name = normalizeMetadataPath(options.workspace.workspaceRoot, asset.name);
    if (assets.length < 100) {
      assets.push({ name, size: asset.size });
    } else {
      droppedAssets += 1;
    }
  }

  const chunks: BuildMetadataFacet['chunks'] = [];
  let droppedChunks = 0;
  for (const chunk of json.chunks ?? []) {
    if (!Array.isArray(chunk.files)) {
      continue;
    }
    if (chunks.length >= 100) {
      droppedChunks += 1;
      continue;
    }

    const files: string[] = [];
    for (const file of chunk.files) {
      if (typeof file !== 'string') {
        continue;
      }
      files.push(normalizeMetadataPath(options.workspace.workspaceRoot, file));
    }

    chunks.push({
      ...(typeof chunk.id === 'string' || typeof chunk.id === 'number'
        ? { id: String(chunk.id) }
        : {}),
      files,
      ...(typeof chunk.initial === 'boolean' ? { initial: chunk.initial } : {}),
    });
  }

  return {
    producer: options.producer,
    command: options.params.command,
    mode: getMode(options.params),
    environment: environment.name,
    target: [getTarget(environment)],
    isWatch,
    isFirstCompile,
    durationMs: time,
    ...(typeof json.hash === 'string' ? { hash: json.hash } : {}),
    hasErrors: stats.hasErrors(),
    hasWarnings: stats.hasWarnings(),
    assets,
    chunks,
    truncated: {
      assets: droppedAssets,
      chunks: droppedChunks,
    },
  };
};

const captureSnapshot = ({
  options,
  environment,
  isFirstCompile,
  isWatch,
  stats,
  time,
}: Parameters<OnAfterEnvironmentCompileFn>[0] & {
  options: BuildContextPluginOptions;
}): Pick<ContextSnapshot, 'completeness' | 'facets' | 'status'> => {
  const deep = options.capture === 'deep' ? 'unsupported' : 'disabled';

  if (stats === undefined) {
    return {
      completeness: { build: 'partial', deep },
      facets: {},
      status: 'error',
    };
  }

  const build = buildMetadataFacet({
    options,
    environment,
    isFirstCompile,
    isWatch,
    stats,
    time,
  });
  return {
    completeness: { build: 'complete', deep },
    facets: { build },
    status: build.hasErrors ? 'fail' : 'pass',
  };
};

const ensureContextWrite = (result: ContextStoreWriteResult): void => {
  if (!result.written) {
    throw result.error;
  }
};

const createContextDescriptor = (
  options: BuildContextPluginOptions,
  environment: EnvironmentContext,
): ContextDescriptor => {
  const packageRoot = normalizeWorkspacePath(
    options.workspace.workspaceRoot,
    options.workspace.packageRoot,
  );
  const configPath =
    options.configPath === undefined
      ? undefined
      : normalizeWorkspacePath(options.workspace.workspaceRoot, options.configPath);
  const mode = getMode(options.params);
  const target = getTarget(environment);
  const identity = [
    options.producer,
    packageRoot,
    configPath ?? '',
    options.product,
    environment.name,
    options.params.command,
    mode,
    target,
  ].join('\u0000');
  const contextId = `ctx_${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;

  return {
    contextId,
    packageRoot,
    product: options.product,
    ...(options.workspace.packageName === undefined
      ? {}
      : { packageName: options.workspace.packageName }),
    ...(configPath === undefined ? {} : { configPath }),
    environment: environment.name,
    target,
    mode,
  };
};

const appendBuildContextPlugin = <T extends { plugins?: RsbuildConfig['plugins'] }>(
  config: T,
  plugin: RsbuildPlugin,
): T => ({
  ...config,
  plugins: [...(config.plugins ?? []), plugin],
});

const createBuildContextPlugin = (options: BuildContextPluginOptions): RsbuildPlugin => {
  let runPromise: Promise<void> | undefined;
  let run: ContextRunManifest | undefined;
  let descriptorsByEnvironment: ReadonlyMap<string, ContextDescriptor> | undefined;
  const sequencesByContext = new Map<string, number>();
  let warned = false;

  return {
    name: 'rstack:context-build',
    setup(api) {
      const guard =
        <Arguments extends unknown[]>(callback: (...args: Arguments) => Promise<void> | void) =>
        async (...args: Arguments): Promise<void> => {
          try {
            await callback(...args);
          } catch {
            if (!warned) {
              warned = true;
              try {
                api.logger.warn('Failed to capture Rstack build context.');
              } catch {
                return;
              }
            }
          }
        };

      const ensureRun: OnBeforeBuildFn = async ({ environments }) => {
        if (runPromise !== undefined) {
          await runPromise;
          return;
        }

        const now = options.now ?? (() => new Date());
        const contexts = Object.values(environments)
          .map((environment) => createContextDescriptor(options, environment))
          .sort((left, right) => left.environment!.localeCompare(right.environment!));
        const nextRun: ContextRunManifest = {
          schemaVersion: contextStoreSchemaVersion,
          runId: options.createRunId?.() ?? `run_${Date.now()}_${randomUUID()}`,
          producer: options.producer,
          command: options.params.command,
          startedAt: now().toISOString(),
          contexts,
        };

        run = nextRun;
        descriptorsByEnvironment = new Map(
          contexts.map((context) => [context.environment!, context]),
        );
        runPromise = writeContextRunManifest(options.workspace.workspaceRoot, nextRun).then(
          ensureContextWrite,
        );
        await runPromise;
      };

      const publishSnapshot: OnAfterEnvironmentCompileFn = ({
        environment,
        isFirstCompile,
        isWatch,
        stats,
        time,
      }) => {
        const capture = captureSnapshot({
          options,
          environment,
          isFirstCompile,
          isWatch,
          stats,
          time,
        });
        const environmentName = environment.name;
        const currentRun = run;
        const currentRunPromise = runPromise;
        const currentDescriptorsByEnvironment = descriptorsByEnvironment;

        return (async (): Promise<void> => {
          if (
            currentRunPromise === undefined ||
            currentRun === undefined ||
            currentDescriptorsByEnvironment === undefined
          ) {
            throw new Error('Build context run has not started.');
          }

          await currentRunPromise;
          const descriptor = currentDescriptorsByEnvironment.get(environmentName);
          if (descriptor === undefined) {
            throw new Error('Build environment is missing from the run manifest.');
          }

          const sequence = (sequencesByContext.get(descriptor.contextId) ?? 0) + 1;
          const now = options.now ?? (() => new Date());
          const snapshot: ContextSnapshot = {
            schemaVersion: contextStoreSchemaVersion,
            snapshotId: `snap_${currentRun.runId}_${descriptor.contextId}_${sequence}`,
            runId: currentRun.runId,
            contextId: descriptor.contextId,
            sequence,
            observedAt: now().toISOString(),
            ...capture,
          };

          ensureContextWrite(await writeContextSnapshot(options.workspace.workspaceRoot, snapshot));
          sequencesByContext.set(descriptor.contextId, sequence);
        })();
      };

      api.onBeforeBuild(guard(ensureRun));
      api.onBeforeDevCompile(guard(ensureRun));
      api.onAfterEnvironmentCompile(guard(publishSnapshot));
    },
  };
};

export { appendBuildContextPlugin, createBuildContextPlugin };
export type { BuildContextPluginOptions };
