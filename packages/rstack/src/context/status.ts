import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { type ProjectContextStatus, type ProjectStatus } from './model.ts';
import { readContextWorkspaceStatus } from './store.ts';

type ProjectContextStatusWithStart = ProjectContextStatus & {
  startedAt: string;
};

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
  const contexts = workspace.runs
    .flatMap(({ run, contexts: runContexts }) =>
      runContexts.map(
        ({ context, latestSnapshot }) =>
          ({
            runId: run.runId,
            producer: run.producer,
            context,
            state: latestSnapshot === undefined ? 'pending' : 'ready',
            ...(latestSnapshot === undefined ? {} : { latestSnapshot }),
            startedAt: run.startedAt,
          }) satisfies ProjectContextStatusWithStart,
      ),
    )
    .sort(compareProjectContexts)
    .map(({ startedAt: _, ...context }) => context);

  return {
    schemaVersion: workspace.schemaVersion,
    workspaceId,
    contexts,
    issues: workspace.issues,
  };
};

export { readProjectStatus };
