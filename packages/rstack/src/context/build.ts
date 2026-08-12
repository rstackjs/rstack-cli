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

const normalizeWorkspacePath = (workspaceRoot: string, value: string): string => {
  const normalized = path.relative(workspaceRoot, value).split(path.sep).join('/');

  if (normalized === '..' || normalized.startsWith('../') || path.isAbsolute(normalized)) {
    throw new Error('Context paths must remain within the workspace.');
  }

  return normalized || '.';
};

const getTarget = (environment: EnvironmentContext): string => environment.config.output.target;

const getMode = (params: ConfigParams): string => params.envMode ?? params.env;

const normalizeMetadataPath = (workspaceRoot: string, value: string): string | undefined => {
  let normalized: string;

  try {
    normalized = path.isAbsolute(value)
      ? normalizeWorkspacePath(workspaceRoot, value)
      : value.split(path.sep).join('/').replaceAll('\\', '/');
  } catch {
    return undefined;
  }

  if (
    normalized === '..' ||
    normalized.startsWith('../') ||
    path.isAbsolute(normalized) ||
    /^[A-Za-z]:\//u.test(normalized)
  ) {
    return undefined;
  }

  return normalized;
};

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
    timings: true,
    assets: true,
    chunks: true,
    errors: false,
    warnings: false,
  }) as {
    assets?: Array<{ name?: unknown; size?: unknown }>;
    chunks?: Array<{ files?: unknown; id?: unknown; initial?: unknown }>;
    hash?: unknown;
  };
  const assets = (json.assets ?? []).flatMap((asset) => {
    if (typeof asset.name !== 'string' || typeof asset.size !== 'number') {
      return [];
    }
    const name = normalizeMetadataPath(options.workspace.workspaceRoot, asset.name);
    return name === undefined ? [] : [{ name, size: asset.size }];
  });
  const chunks = (json.chunks ?? []).flatMap((chunk) => {
    if (!Array.isArray(chunk.files)) {
      return [];
    }
    const files = chunk.files.flatMap((file) =>
      typeof file === 'string'
        ? (() => {
            const normalized = normalizeMetadataPath(options.workspace.workspaceRoot, file);
            return normalized === undefined ? [] : [normalized];
          })()
        : [],
    );

    return [
      {
        ...(typeof chunk.id === 'string' || typeof chunk.id === 'number'
          ? { id: String(chunk.id) }
          : {}),
        files: files.slice(0, 20),
        ...(typeof chunk.initial === 'boolean' ? { initial: chunk.initial } : {}),
      },
    ];
  });

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
    assets: assets.slice(0, 100),
    chunks: chunks.slice(0, 100),
    truncated: {
      assets: Math.max(assets.length - 100, 0),
      chunks: Math.max(chunks.length - 100, 0),
    },
  };
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
    name: 'rstack:build-context',
    setup(api) {
      const guard =
        <Arguments extends unknown[]>(callback: (...args: Arguments) => Promise<void> | void) =>
        async (...args: Arguments): Promise<void> => {
          try {
            await callback(...args);
          } catch {
            if (!warned) {
              warned = true;
              api.logger.warn('Failed to capture Rstack build context.');
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
          () => undefined,
        );
        await runPromise;
      };

      const publishSnapshot: OnAfterEnvironmentCompileFn = async ({
        environment,
        isFirstCompile,
        isWatch,
        stats,
        time,
      }) => {
        if (
          runPromise === undefined ||
          run === undefined ||
          descriptorsByEnvironment === undefined
        ) {
          throw new Error('Build context run has not started.');
        }

        await runPromise;
        const descriptor = descriptorsByEnvironment.get(environment.name);
        if (descriptor === undefined) {
          throw new Error('Build environment is missing from the run manifest.');
        }

        const sequence = (sequencesByContext.get(descriptor.contextId) ?? 0) + 1;
        sequencesByContext.set(descriptor.contextId, sequence);
        const now = options.now ?? (() => new Date());
        const completeness = {
          build: stats === undefined ? 'partial' : 'complete',
          deep: options.capture === 'deep' ? 'unsupported' : 'disabled',
        } as const;
        const snapshot: ContextSnapshot = {
          schemaVersion: contextStoreSchemaVersion,
          snapshotId: `snap_${run.runId}_${descriptor.contextId}_${sequence}`,
          runId: run.runId,
          contextId: descriptor.contextId,
          sequence,
          observedAt: now().toISOString(),
          status: stats?.hasErrors() === true ? 'fail' : stats === undefined ? 'error' : 'pass',
          completeness,
          facets:
            stats === undefined
              ? {}
              : {
                  build: buildMetadataFacet({
                    options,
                    environment,
                    isFirstCompile,
                    isWatch,
                    stats,
                    time,
                  }),
                },
        };

        await writeContextSnapshot(options.workspace.workspaceRoot, snapshot);
      };

      api.onBeforeBuild(guard(ensureRun));
      api.onBeforeDevCompile(guard(ensureRun));
      api.onAfterEnvironmentCompile(guard(publishSnapshot));
    },
  };
};

export { appendBuildContextPlugin, createBuildContextPlugin };
export type { BuildContextPluginOptions };
