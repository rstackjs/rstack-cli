import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { type ProjectContextStatus, type ProjectStatus } from './model.ts';
import { assessSnapshotFreshness } from './source.ts';
import { readContextWorkspaceStatus } from './store.ts';

const compareStrings = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

const compareProjectContexts = (
  left: ProjectContextStatus & { startedAt: string },
  right: ProjectContextStatus & { startedAt: string },
): number => {
  const fields = [
    [left.context.packageRoot, right.context.packageRoot],
    [left.context.product, right.context.product],
    [left.context.environment ?? '', right.context.environment ?? ''],
    [left.startedAt, right.startedAt],
    [left.runId, right.runId],
  ] as const;

  for (const [leftValue, rightValue] of fields) {
    const result = compareStrings(leftValue, rightValue);
    if (result !== 0) return result;
  }
  return 0;
};

const readProjectStatus = async (workspaceRoot: string): Promise<ProjectStatus> => {
  const workspace = await readContextWorkspaceStatus(workspaceRoot);
  const workspacePath = await realpath(workspaceRoot);
  const workspaceId = `ws_${createHash('sha256').update(workspacePath).digest('hex').slice(0, 24)}`;
  const currentByContextId = new Map<
    string,
    (typeof workspace.runs)[number]['contexts'][number] & {
      run: (typeof workspace.runs)[number]['run'];
    }
  >();

  for (const { run, contexts } of workspace.runs) {
    for (const contextStatus of contexts) {
      const current = currentByContextId.get(contextStatus.context.contextId);
      if (
        current === undefined ||
        compareStrings(current.run.startedAt, run.startedAt) < 0 ||
        (current.run.startedAt === run.startedAt &&
          compareStrings(current.run.runId, run.runId) < 0)
      ) {
        currentByContextId.set(contextStatus.context.contextId, {
          ...contextStatus,
          run,
        });
      }
    }
  }

  const contexts = (
    await Promise.all(
      [...currentByContextId.values()].map(async ({ run, context, latestSnapshot }) => ({
        runId: run.runId,
        producer: run.producer,
        context,
        state: latestSnapshot === undefined ? ('pending' as const) : ('ready' as const),
        ...(latestSnapshot === undefined
          ? {}
          : {
              latestSnapshot,
              freshness: await assessSnapshotFreshness(workspaceRoot, latestSnapshot),
            }),
        startedAt: run.startedAt,
      })),
    )
  )
    .sort(compareProjectContexts)
    .map(({ startedAt: _, ...context }) => context satisfies ProjectContextStatus);

  return {
    schemaVersion: workspace.schemaVersion,
    workspaceId,
    contexts,
    issues: workspace.issues,
  };
};

export { readProjectStatus };
