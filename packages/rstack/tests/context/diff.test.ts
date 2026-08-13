import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import {
  diffContextSnapshots,
  diffStoredContextSnapshots,
  type SnapshotDiffKind,
} from '../../src/context/diff.ts';
import {
  contextStoreSchemaVersion,
  type ContextDescriptor,
  type ContextFreshness,
  type ContextProducer,
  type ContextRunManifest,
  type ContextSnapshot,
  type LintFacet,
  type StoredContextSnapshot,
  type TestFacet,
} from '../../src/context/model.ts';
import { writeContextRunManifest, writeContextSnapshot } from '../../src/context/store.ts';

const unknownFreshness: ContextFreshness = {
  state: 'unknown',
  changedPaths: [],
};

const emptyLintFacet = (): LintFacet => ({
  producer: 'rslint',
  mode: 'files',
  fixPreviewCaptured: false,
  files: [],
  totals: {
    files: 0,
    errors: 0,
    warnings: 0,
    fixableErrors: 0,
    fixableWarnings: 0,
  },
});

const emptyTestFacet = (): TestFacet => ({
  producer: 'rstest',
  files: [],
  stats: {
    tests: { total: 0, passed: 0, failed: 0, skipped: 0, todo: 0 },
    files: { total: 0, failed: 0 },
  },
  durationMs: 0,
  unhandledErrors: [],
});

const storedSnapshot = ({
  snapshotId,
  producer,
  contextId = 'ctx_app',
  facet,
  schemaVersion = contextStoreSchemaVersion,
}: {
  snapshotId: string;
  producer: ContextProducer;
  contextId?: string;
  facet?: LintFacet | TestFacet;
  schemaVersion?: number;
}): StoredContextSnapshot => {
  const context: ContextDescriptor = {
    contextId,
    packageRoot: '.',
    product: 'development',
  };
  const run: ContextRunManifest = {
    schemaVersion: contextStoreSchemaVersion,
    runId: `run_${snapshotId}`,
    producer,
    command: producer,
    startedAt: '2026-08-12T08:00:00.000Z',
    contexts: [context],
  };
  const snapshot = {
    schemaVersion,
    snapshotId,
    runId: run.runId,
    contextId,
    sequence: 0,
    observedAt: '2026-08-12T08:00:01.000Z',
    status: 'pass',
    completeness: {},
    facets:
      facet?.producer === 'rslint'
        ? { lint: facet }
        : facet?.producer === 'rstest'
          ? { test: facet }
          : {},
  } as ContextSnapshot;
  return { run, context, snapshot };
};

const compare = (
  left: StoredContextSnapshot,
  right: StoredContextSnapshot,
  kind: SnapshotDiffKind,
) => diffStoredContextSnapshots(left, right, kind, unknownFreshness, unknownFreshness);

test('returns every applicable incompatibility reason in stable order', () => {
  const left = storedSnapshot({
    snapshotId: 'snap_left',
    producer: 'rslint',
    contextId: 'ctx_left',
    facet: emptyLintFacet(),
  });
  const right = storedSnapshot({
    snapshotId: 'snap_right',
    producer: 'rstest',
    contextId: 'ctx_right',
    schemaVersion: 2,
  });

  expect(compare(left, right, 'diagnostics')).toEqual({
    compatible: false,
    reasons: ['context', 'facet', 'producer', 'schema-version'],
  });
});

test('identifies the missing side when a requested snapshot does not exist', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-context-diff-missing-'));
  try {
    const present = storedSnapshot({
      snapshotId: 'snap_present',
      producer: 'rslint',
      facet: emptyLintFacet(),
    });
    await writeContextRunManifest(workspaceRoot, present.run);
    await writeContextSnapshot(workspaceRoot, present.snapshot);

    await expect(
      diffContextSnapshots(workspaceRoot, {
        leftSnapshotId: 'snap_missing_left',
        rightSnapshotId: 'snap_present',
      }),
    ).rejects.toThrow('Snapshot not found: snap_missing_left');
    await expect(
      diffContextSnapshots(workspaceRoot, {
        leftSnapshotId: 'snap_present',
        rightSnapshotId: 'snap_missing_right',
      }),
    ).rejects.toThrow('Snapshot not found: snap_missing_right');
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
});

test('diffs lint diagnostics by location and reports all observable changes', () => {
  const leftFacet = emptyLintFacet();
  leftFacet.files = [
    {
      path: 'src/a.ts',
      digest: 'a'.repeat(64),
      errorCount: 2,
      warningCount: 0,
      fixableErrorCount: 0,
      fixableWarningCount: 0,
      messages: [
        {
          ruleId: 'changed-rule',
          severity: 2,
          message: 'before',
          line: 2,
          column: 3,
          endLine: 2,
          endColumn: 8,
        },
        {
          ruleId: null,
          severity: 2,
          message: 'removed',
          line: 1,
          column: 1,
        },
      ],
    },
  ];
  const rightFacet = emptyLintFacet();
  rightFacet.files = [
    {
      path: 'src/a.ts',
      digest: 'b'.repeat(64),
      errorCount: 0,
      warningCount: 2,
      fixableErrorCount: 0,
      fixableWarningCount: 1,
      messages: [
        {
          ruleId: null,
          severity: 1,
          message: 'added',
          line: 1,
          column: 1,
        },
        {
          ruleId: 'changed-rule',
          severity: 1,
          message: 'after',
          line: 2,
          column: 3,
          endLine: 3,
          endColumn: 4,
          fix: { range: [2, 3], text: 'fixed' },
        },
      ],
    },
  ];
  const left = storedSnapshot({
    snapshotId: 'snap_left',
    producer: 'rslint',
    facet: leftFacet,
  });
  const right = storedSnapshot({
    snapshotId: 'snap_right',
    producer: 'rslint',
    facet: rightFacet,
  });

  const result = compare(left, right, 'diagnostics');
  expect(result).toEqual({
    compatible: true,
    producer: 'rslint',
    contextId: 'ctx_app',
    left: { snapshotId: 'snap_left', freshness: unknownFreshness },
    right: { snapshotId: 'snap_right', freshness: unknownFreshness },
    added: [
      {
        path: 'src/a.ts',
        ruleId: null,
        severity: 'warning',
        message: 'added',
        line: 1,
        column: 1,
        fixable: false,
      },
    ],
    removed: [
      {
        path: 'src/a.ts',
        ruleId: null,
        severity: 'error',
        message: 'removed',
        line: 1,
        column: 1,
        fixable: false,
      },
    ],
    changed: [
      {
        before: {
          path: 'src/a.ts',
          ruleId: 'changed-rule',
          severity: 'error',
          message: 'before',
          line: 2,
          column: 3,
          endLine: 2,
          endColumn: 8,
          fixable: false,
        },
        after: {
          path: 'src/a.ts',
          ruleId: 'changed-rule',
          severity: 'warning',
          message: 'after',
          line: 2,
          column: 3,
          endLine: 3,
          endColumn: 4,
          fixable: true,
        },
      },
    ],
    summary: { added: 1, removed: 1, changed: 1 },
  });

  const reversed = compare(right, left, 'diagnostics');
  expect(reversed.compatible && reversed.added).toEqual(
    result.compatible ? result.removed : undefined,
  );
  expect(reversed.compatible && reversed.removed).toEqual(
    result.compatible ? result.added : undefined,
  );
  expect(reversed.compatible && reversed.changed).toEqual(
    result.compatible
      ? result.changed.map(({ before, after }) => ({
          before: after,
          after: before,
        }))
      : undefined,
  );
});

test('preserves duplicate lint diagnostics when only one occurrence is removed', () => {
  const diagnostic = {
    ruleId: 'duplicate-rule',
    severity: 2 as const,
    message: 'duplicate',
    line: 1,
    column: 1,
  };
  const leftFacet = emptyLintFacet();
  leftFacet.files = [
    {
      path: 'src/duplicate.ts',
      digest: 'a'.repeat(64),
      errorCount: 2,
      warningCount: 0,
      fixableErrorCount: 0,
      fixableWarningCount: 0,
      messages: [diagnostic, { ...diagnostic }],
    },
  ];
  const rightFacet = emptyLintFacet();
  rightFacet.files = [
    {
      path: 'src/duplicate.ts',
      digest: 'b'.repeat(64),
      errorCount: 1,
      warningCount: 0,
      fixableErrorCount: 0,
      fixableWarningCount: 0,
      messages: [{ ...diagnostic }],
    },
  ];

  const result = compare(
    storedSnapshot({
      snapshotId: 'snap_left',
      producer: 'rslint',
      facet: leftFacet,
    }),
    storedSnapshot({
      snapshotId: 'snap_right',
      producer: 'rslint',
      facet: rightFacet,
    }),
    'diagnostics',
  );

  expect(result).toMatchObject({
    compatible: true,
    added: [],
    removed: [
      {
        path: 'src/duplicate.ts',
        ruleId: 'duplicate-rule',
        message: 'duplicate',
      },
    ],
    changed: [],
    summary: { added: 0, removed: 1, changed: 0 },
  });
});

test('diffs project-qualified test results and reports execution changes', () => {
  const leftFacet = emptyTestFacet();
  leftFacet.files = [
    {
      project: 'alpha',
      path: 'math.test.ts',
      status: 'pass',
      tests: [
        {
          project: 'alpha',
          path: 'math.test.ts',
          name: 'adds',
          status: 'pass',
        },
      ],
    },
    {
      project: 'beta',
      path: 'math.test.ts',
      status: 'pass',
      tests: [
        {
          project: 'beta',
          path: 'math.test.ts',
          parentNames: ['math'],
          name: 'adds',
          status: 'pass',
          durationMs: 2,
        },
      ],
    },
  ];
  const rightFacet = emptyTestFacet();
  rightFacet.files = [
    {
      project: 'beta',
      path: 'math.test.ts',
      status: 'fail',
      tests: [
        {
          project: 'beta',
          path: 'math.test.ts',
          parentNames: ['math'],
          name: 'adds',
          status: 'fail',
          durationMs: 7,
          errors: [{ name: 'AssertionError', message: 'expected 3' }],
          retryErrors: [{ name: 'AssertionError', message: 'expected 2' }],
          retryCount: 1,
        },
      ],
    },
    {
      project: 'gamma',
      path: 'math.test.ts',
      status: 'todo',
      tests: [
        {
          project: 'gamma',
          path: 'math.test.ts',
          name: 'adds',
          status: 'todo',
        },
      ],
    },
  ];

  const result = compare(
    storedSnapshot({
      snapshotId: 'snap_left',
      producer: 'rstest',
      facet: leftFacet,
    }),
    storedSnapshot({
      snapshotId: 'snap_right',
      producer: 'rstest',
      facet: rightFacet,
    }),
    'tests',
  );

  expect(result).toMatchObject({
    compatible: true,
    producer: 'rstest',
    added: [{ project: 'gamma', path: 'math.test.ts', name: 'adds', status: 'todo' }],
    removed: [{ project: 'alpha', path: 'math.test.ts', name: 'adds', status: 'pass' }],
    changed: [
      {
        before: {
          project: 'beta',
          path: 'math.test.ts',
          parentNames: ['math'],
          name: 'adds',
          status: 'pass',
          durationMs: 2,
        },
        after: {
          project: 'beta',
          path: 'math.test.ts',
          parentNames: ['math'],
          name: 'adds',
          status: 'fail',
          durationMs: 7,
          errors: [{ name: 'AssertionError', message: 'expected 3' }],
          retryErrors: [{ name: 'AssertionError', message: 'expected 2' }],
          retryCount: 1,
        },
      },
    ],
    summary: { added: 1, removed: 1, changed: 1 },
  });
});

test('preserves duplicate test results when only one occurrence is removed', () => {
  const duplicate = {
    project: 'unit',
    path: 'duplicate.test.ts',
    parentNames: ['suite'],
    name: 'duplicate',
    status: 'pass' as const,
  };
  const leftFacet = emptyTestFacet();
  leftFacet.files = [
    {
      project: 'unit',
      path: 'duplicate.test.ts',
      status: 'pass',
      tests: [duplicate, { ...duplicate }],
    },
  ];
  const rightFacet = emptyTestFacet();
  rightFacet.files = [
    {
      project: 'unit',
      path: 'duplicate.test.ts',
      status: 'pass',
      tests: [{ ...duplicate }],
    },
  ];

  const result = compare(
    storedSnapshot({
      snapshotId: 'snap_left',
      producer: 'rstest',
      facet: leftFacet,
    }),
    storedSnapshot({
      snapshotId: 'snap_right',
      producer: 'rstest',
      facet: rightFacet,
    }),
    'tests',
  );

  expect(result).toMatchObject({
    compatible: true,
    added: [],
    removed: [duplicate],
    changed: [],
    summary: { added: 0, removed: 1, changed: 0 },
  });
});

test('diffs file-level test failures without inventing test cases', () => {
  const leftFacet = emptyTestFacet();
  leftFacet.files = [
    {
      project: 'unit',
      path: 'broken.test.ts',
      status: 'fail',
      errors: [{ name: 'ImportError', message: 'could not import setup-a' }],
      tests: [],
    },
  ];
  const rightFacet = emptyTestFacet();
  rightFacet.files = [
    {
      project: 'unit',
      path: 'broken.test.ts',
      status: 'fail',
      errors: [{ name: 'ImportError', message: 'could not import setup-b' }],
      tests: [],
    },
  ];

  const result = compare(
    storedSnapshot({
      snapshotId: 'snap_left',
      producer: 'rstest',
      facet: leftFacet,
    }),
    storedSnapshot({
      snapshotId: 'snap_right',
      producer: 'rstest',
      facet: rightFacet,
    }),
    'tests',
  );

  expect(result).toMatchObject({
    compatible: true,
    added: [],
    removed: [],
    changed: [
      {
        before: {
          kind: 'file-error',
          project: 'unit',
          path: 'broken.test.ts',
          error: { name: 'ImportError', message: 'could not import setup-a' },
        },
        after: {
          kind: 'file-error',
          project: 'unit',
          path: 'broken.test.ts',
          error: { name: 'ImportError', message: 'could not import setup-b' },
        },
      },
    ],
    summary: { added: 0, removed: 0, changed: 1 },
  });
});

test('reads immutable snapshots, reports independent freshness, and returns an empty equal diff', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-context-diff-'));
  try {
    await writeFile(path.join(workspaceRoot, 'input.ts'), 'current');
    const context: ContextDescriptor = {
      contextId: 'ctx_lint',
      packageRoot: '.',
      product: 'development',
      environment: 'lint',
    };
    const run: ContextRunManifest = {
      schemaVersion: contextStoreSchemaVersion,
      runId: 'run_lint',
      producer: 'rslint',
      command: 'rs lint',
      startedAt: '2026-08-12T08:00:00.000Z',
      contexts: [context],
    };
    await writeContextRunManifest(workspaceRoot, run);
    const source = (content: string) => ({
      inputs: [
        {
          path: 'input.ts',
          digest: createHash('sha256').update(content).digest('hex'),
        },
      ],
      inputCompleteness: 'complete' as const,
    });
    const snapshot = (snapshotId: string, sequence: number, content: string): ContextSnapshot => ({
      schemaVersion: contextStoreSchemaVersion,
      snapshotId,
      runId: run.runId,
      contextId: context.contextId,
      sequence,
      observedAt: `2026-08-12T08:00:0${sequence + 1}.000Z`,
      status: 'pass',
      completeness: { lint: 'complete' },
      facets: { lint: emptyLintFacet() },
      source: source(content),
    });
    await writeContextSnapshot(workspaceRoot, snapshot('snap_fresh', 0, 'current'));
    await writeContextSnapshot(workspaceRoot, snapshot('snap_stale', 1, 'old'));

    expect(
      await diffContextSnapshots(workspaceRoot, {
        leftSnapshotId: 'snap_fresh',
        rightSnapshotId: 'snap_stale',
      }),
    ).toEqual({
      compatible: true,
      producer: 'rslint',
      contextId: 'ctx_lint',
      left: {
        snapshotId: 'snap_fresh',
        freshness: { state: 'fresh', changedPaths: [] },
      },
      right: {
        snapshotId: 'snap_stale',
        freshness: { state: 'stale', changedPaths: ['input.ts'] },
      },
      added: [],
      removed: [],
      changed: [],
      summary: { added: 0, removed: 0, changed: 0 },
    });
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
});
