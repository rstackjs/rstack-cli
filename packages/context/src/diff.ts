import { isDeepStrictEqual } from 'node:util';
import {
  type ContextFreshness,
  type LintFacet,
  type StoredContextSnapshot,
  type TestCaseRecord,
  type TestErrorRecord,
  type TestFacet,
} from './model.ts';
import { validateLintFacet, validateTestFacet } from './records.ts';
import { assessSnapshotFreshness } from './source.ts';
import { readContextSnapshotById } from './store.ts';

type SnapshotDiffKind = 'diagnostics' | 'tests';

type SnapshotDiffRequest = {
  leftSnapshotId: string;
  rightSnapshotId: string;
  kind?: SnapshotDiffKind;
};

type SnapshotDiffIncompatibilityReason = 'schema-version' | 'producer' | 'context' | 'facet';

type SnapshotDiagnostic = {
  path: string;
  ruleId: string | null;
  severity: 'error' | 'warning';
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  fixable: boolean;
};

type SnapshotTestFileError = {
  kind: 'file-error';
  project: string;
  path: string;
  error: TestErrorRecord;
};

type SnapshotDiffItem = SnapshotDiagnostic | SnapshotTestFileError | TestCaseRecord;

type SnapshotDiffResult =
  | {
      compatible: false;
      reasons: SnapshotDiffIncompatibilityReason[];
    }
  | {
      compatible: true;
      producer: 'rslint' | 'rstest';
      contextId: string;
      left: { snapshotId: string; freshness: ContextFreshness };
      right: { snapshotId: string; freshness: ContextFreshness };
      added: SnapshotDiffItem[];
      removed: SnapshotDiffItem[];
      changed: Array<{ before: SnapshotDiffItem; after: SnapshotDiffItem }>;
      summary: { added: number; removed: number; changed: number };
    };

const diagnosticIdentity = (diagnostic: SnapshotDiagnostic): string =>
  JSON.stringify([
    diagnostic.path,
    diagnostic.ruleId === null ? 'message' : 'rule',
    diagnostic.ruleId ?? diagnostic.message,
    diagnostic.line,
    diagnostic.column,
  ]);

const testIdentity = (result: SnapshotTestFileError | TestCaseRecord): string =>
  'kind' in result
    ? JSON.stringify([result.project, result.path, result.kind, result.error.name])
    : JSON.stringify([result.project, result.path, result.parentNames ?? [], result.name]);

const lintDiagnostics = (facet: LintFacet): SnapshotDiagnostic[] =>
  facet.files.flatMap((file) =>
    file.messages.map((message) => ({
      path: file.path,
      ruleId: message.ruleId,
      severity: message.severity === 2 ? ('error' as const) : ('warning' as const),
      message: message.message,
      line: message.line,
      column: message.column,
      ...(message.endLine === undefined ? {} : { endLine: message.endLine }),
      ...(message.endColumn === undefined ? {} : { endColumn: message.endColumn }),
      fixable: message.fix !== undefined,
    })),
  );

const testResults = (facet: TestFacet): Array<SnapshotTestFileError | TestCaseRecord> =>
  facet.files.flatMap((file) => [
    ...(file.errors ?? []).map((error) => ({
      kind: 'file-error' as const,
      project: file.project,
      path: file.path,
      error,
    })),
    ...file.tests,
  ]);

const diffItems = <T extends SnapshotDiffItem>(
  leftItems: T[],
  rightItems: T[],
  identity: (item: T) => string,
): Pick<Extract<SnapshotDiffResult, { compatible: true }>, 'added' | 'removed' | 'changed'> => {
  const leftByIdentity = new Map<string, T[]>();
  const rightByIdentity = new Map<string, T[]>();
  for (const item of leftItems) {
    const itemIdentity = identity(item);
    leftByIdentity.set(itemIdentity, [...(leftByIdentity.get(itemIdentity) ?? []), item]);
  }
  for (const item of rightItems) {
    const itemIdentity = identity(item);
    rightByIdentity.set(itemIdentity, [...(rightByIdentity.get(itemIdentity) ?? []), item]);
  }
  const identities = [...new Set([...leftByIdentity.keys(), ...rightByIdentity.keys()])].sort();
  const added: T[] = [];
  const removed: T[] = [];
  const changed: Array<{ before: T; after: T }> = [];

  for (const itemIdentity of identities) {
    const after = [...(rightByIdentity.get(itemIdentity) ?? [])];
    const before = (leftByIdentity.get(itemIdentity) ?? []).filter((item) => {
      const exactIndex = after.findIndex((candidate) => isDeepStrictEqual(item, candidate));
      if (exactIndex === -1) return true;
      after.splice(exactIndex, 1);
      return false;
    });
    const changedCount = Math.min(before.length, after.length);
    for (let index = 0; index < changedCount; index += 1) {
      changed.push({ before: before[index]!, after: after[index]! });
    }
    removed.push(...before.slice(changedCount));
    added.push(...after.slice(changedCount));
  }
  return { added, removed, changed };
};

const requestedFacet = (
  stored: StoredContextSnapshot,
  kind: SnapshotDiffKind,
): LintFacet | TestFacet | undefined =>
  kind === 'diagnostics'
    ? validateLintFacet(stored.snapshot.facets.lint)
    : validateTestFacet(stored.snapshot.facets.test);

const diffStoredContextSnapshots = (
  left: StoredContextSnapshot,
  right: StoredContextSnapshot,
  kind: SnapshotDiffKind,
  leftFreshness: ContextFreshness,
  rightFreshness: ContextFreshness,
): SnapshotDiffResult => {
  const reasons: SnapshotDiffIncompatibilityReason[] = [];
  if (left.snapshot.schemaVersion !== right.snapshot.schemaVersion) reasons.push('schema-version');
  if (left.run.producer !== right.run.producer) reasons.push('producer');
  if (left.snapshot.contextId !== right.snapshot.contextId) reasons.push('context');

  const expectedProducer = kind === 'diagnostics' ? 'rslint' : 'rstest';
  const leftFacet = requestedFacet(left, kind);
  const rightFacet = requestedFacet(right, kind);
  if (
    left.run.producer !== expectedProducer ||
    right.run.producer !== expectedProducer ||
    leftFacet === undefined ||
    rightFacet === undefined
  ) {
    reasons.push('facet');
  }
  if (reasons.length > 0) return { compatible: false, reasons: reasons.sort() };

  const items =
    kind === 'diagnostics'
      ? diffItems(
          lintDiagnostics(leftFacet as LintFacet),
          lintDiagnostics(rightFacet as LintFacet),
          diagnosticIdentity,
        )
      : diffItems(
          testResults(leftFacet as TestFacet),
          testResults(rightFacet as TestFacet),
          testIdentity,
        );

  return {
    compatible: true,
    producer: expectedProducer,
    contextId: left.snapshot.contextId,
    left: { snapshotId: left.snapshot.snapshotId, freshness: leftFreshness },
    right: { snapshotId: right.snapshot.snapshotId, freshness: rightFreshness },
    ...items,
    summary: {
      added: items.added.length,
      removed: items.removed.length,
      changed: items.changed.length,
    },
  };
};

const diffContextSnapshots = async (
  workspaceRoot: string,
  request: SnapshotDiffRequest,
): Promise<SnapshotDiffResult> => {
  const [left, right] = await Promise.all([
    readContextSnapshotById(workspaceRoot, request.leftSnapshotId),
    readContextSnapshotById(workspaceRoot, request.rightSnapshotId),
  ]);
  if (left === undefined) throw new Error(`Snapshot not found: ${request.leftSnapshotId}`);
  if (right === undefined) throw new Error(`Snapshot not found: ${request.rightSnapshotId}`);

  const kind =
    request.kind ??
    (left.run.producer === 'rstest' ? ('tests' as const) : ('diagnostics' as const));
  const [leftFreshness, rightFreshness] = await Promise.all([
    assessSnapshotFreshness(workspaceRoot, left.snapshot),
    assessSnapshotFreshness(workspaceRoot, right.snapshot),
  ]);
  return diffStoredContextSnapshots(left, right, kind, leftFreshness, rightFreshness);
};

export { diffContextSnapshots, diffStoredContextSnapshots };
export type {
  SnapshotDiagnostic,
  SnapshotDiffIncompatibilityReason,
  SnapshotDiffKind,
  SnapshotDiffRequest,
  SnapshotDiffResult,
};
