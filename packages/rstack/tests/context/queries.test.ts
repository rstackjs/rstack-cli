import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import {
  contextStoreSchemaVersion,
  writeContextRunManifest,
  writeContextSnapshot,
  type ContextDescriptor,
  type ContextRunManifest,
  type ContextSnapshot,
} from '../../src/context/index.ts';
import {
  explainDeadCodeCandidate,
  findUnusedCandidates,
  readProductRoots,
  traceModuleImpact,
} from '../../src/context/queries.ts';

const fixtureRoot = path.resolve(import.meta.dirname, '../fixtures/context/reachability');

const withFixtureWorkspace = async (
  fixture: 'application' | 'library',
  callback: (workspaceRoot: string) => Promise<void>,
): Promise<void> => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-context-queries-'));
  await cp(path.join(fixtureRoot, fixture), workspaceRoot, { recursive: true });

  try {
    await callback(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
};

const recordBuild = async (
  workspaceRoot: string,
  context: ContextDescriptor,
  runId: string,
  observedAt?: string,
): Promise<void> => {
  const run = {
    schemaVersion: contextStoreSchemaVersion,
    runId,
    producer: context.product === 'library' ? 'rslib' : 'rsbuild',
    command: 'build',
    startedAt: '2026-08-12T04:00:00.000Z',
    contexts: [context],
  } satisfies ContextRunManifest;
  expect(await writeContextRunManifest(workspaceRoot, run)).toMatchObject({
    written: true,
  });

  if (observedAt === undefined) return;
  const snapshot = {
    schemaVersion: contextStoreSchemaVersion,
    snapshotId: `snap_${runId}`,
    runId,
    contextId: context.contextId,
    sequence: 1,
    observedAt,
    status: 'pass',
    completeness: { build: 'complete' },
    facets: {},
  } satisfies ContextSnapshot;
  expect(await writeContextSnapshot(workspaceRoot, snapshot)).toMatchObject({
    written: true,
  });
};

test('reads product roots with explicit artifact provenance from the newest ready run', async () => {
  await withFixtureWorkspace('application', async (workspaceRoot) => {
    const context = {
      contextId: 'ctx_app',
      packageRoot: '.',
      product: 'application',
    } as const;
    await recordBuild(workspaceRoot, context, 'run_a', '2026-08-12T04:00:01.000Z');
    await recordBuild(workspaceRoot, context, 'run_b', '2026-08-12T04:00:02.000Z');
    await recordBuild(workspaceRoot, context, 'run_c', '2026-08-12T04:00:02.000Z');
    await recordBuild(workspaceRoot, context, 'run_pending');

    const result = await readProductRoots(workspaceRoot, {
      contextId: context.contextId,
      dataFile: 'rsdoctor-data.json',
    });

    expect(result.provenance).toEqual({
      contextId: context.contextId,
      dataFile: 'rsdoctor-data.json',
      artifactBinding: 'explicit-unverified',
      buildObservation: {
        runId: 'run_c',
        snapshotId: 'snap_run_c',
        observedAt: '2026-08-12T04:00:02.000Z',
        status: 'pass',
        buildCompleteness: 'complete',
      },
    });
    expect(result.graph).toEqual({
      moduleCount: 8,
      edgeCount: 4,
      issues: ['duplicate-module-id', 'dangling-edge'],
    });
    expect(result.product.roots.map(({ kind, module }) => [kind, module.id])).toEqual([
      ['production-entry', '1'],
      ['side-effect', '4'],
      ['conservative-runtime', '8'],
      ['conservative-runtime', '5'],
    ]);
  });
});

test('returns only artifact-scoped unreachable module candidates', async () => {
  await withFixtureWorkspace('application', async (workspaceRoot) => {
    const context = {
      contextId: 'ctx_app',
      packageRoot: '.',
      product: 'application',
    } as const;
    await recordBuild(workspaceRoot, context, 'run_app', '2026-08-12T04:00:01.000Z');

    const result = await findUnusedCandidates(workspaceRoot, {
      contextId: context.contextId,
      dataFile: 'rsdoctor-data.json',
    });

    expect(result.roots).toEqual({
      production: 1,
      contract: 0,
      conservative: 3,
    });
    expect(result.total).toBe(1);
    expect(result.returned).toBe(1);
    expect(result.analysisTruncated).toBe(false);
    expect(result.resultTruncated).toBe(false);
    expect(result.candidates).toEqual([
      {
        subject: {
          kind: 'module',
          id: '3',
          path: 'src/legacy.ts',
          name: 'legacy',
          chunks: [],
        },
        classification: 'unreachable-module-candidate',
        state: {
          productionReachability: 'unreachable',
          publicContract: 'not-required',
          shipped: 'unknown',
          optimizerRetention: 'unknown',
        },
        confidence: 'derived',
        evidence: ['No path from selected roots in this artifact graph.'],
        bounds: ['export-usage-schema-unsupported', 'duplicate-module-id', 'dangling-edge'],
      },
    ]);
  });
});

test('applies candidate result limits separately from analysis truncation', async () => {
  await withFixtureWorkspace('application', async (workspaceRoot) => {
    const context = {
      contextId: 'ctx_app',
      packageRoot: '.',
      product: 'application',
    } as const;
    await recordBuild(workspaceRoot, context, 'run_app', '2026-08-12T04:00:01.000Z');
    await writeFile(
      path.join(workspaceRoot, 'rsdoctor-data.json'),
      JSON.stringify({
        data: {
          moduleGraph: {
            modules: [
              { id: 1, path: 'src/index.ts', name: 'index', isEntry: true },
              { id: 2, path: 'src/unused-a.ts', name: 'unused-a' },
              { id: 3, path: 'src/unused-b.ts', name: 'unused-b' },
            ],
            dependencies: [],
          },
        },
      }),
    );

    const result = await findUnusedCandidates(workspaceRoot, {
      contextId: context.contextId,
      dataFile: 'rsdoctor-data.json',
      limit: 1,
    });

    expect(result.total).toBe(2);
    expect(result.returned).toBe(1);
    expect(result.resultTruncated).toBe(true);
    expect(result.analysisTruncated).toBe(false);
    expect(result.candidates[0]?.subject.id).toBe('2');
  });
});

test('keeps rootless modules unknown instead of deriving unreachable candidates', async () => {
  await withFixtureWorkspace('application', async (workspaceRoot) => {
    const context = {
      contextId: 'ctx_app',
      packageRoot: '.',
      product: 'application',
    } as const;
    await recordBuild(workspaceRoot, context, 'run_app', '2026-08-12T04:00:01.000Z');
    await writeFile(
      path.join(workspaceRoot, 'rsdoctor-data.json'),
      JSON.stringify({
        data: {
          moduleGraph: {
            modules: [{ id: 2, path: 'src/orphan.ts', name: 'orphan' }],
            dependencies: [],
          },
        },
      }),
    );

    const candidates = await findUnusedCandidates(workspaceRoot, {
      contextId: context.contextId,
      dataFile: 'rsdoctor-data.json',
    });
    const explanation = await explainDeadCodeCandidate(workspaceRoot, {
      contextId: context.contextId,
      dataFile: 'rsdoctor-data.json',
      module: '2',
    });

    expect(candidates.analysisTruncated).toBe(false);
    expect(candidates.total).toBe(0);
    expect(candidates.candidates).toEqual([]);
    expect(candidates.bounds).toContain('no-production-entry-roots');
    expect(explanation.classification).toBe('insufficient-evidence');
    expect(explanation.state.productionReachability).toBe('unknown');
    expect(explanation.evidence).toEqual([
      'No production entry roots were observed in this artifact graph.',
    ]);
  });
});

test('explains reachable, candidate, and conservatively preserved modules', async () => {
  await withFixtureWorkspace('application', async (workspaceRoot) => {
    const context = {
      contextId: 'ctx_app',
      packageRoot: '.',
      product: 'application',
    } as const;
    await recordBuild(workspaceRoot, context, 'run_app', '2026-08-12T04:00:01.000Z');

    const reachable = await explainDeadCodeCandidate(workspaceRoot, {
      contextId: context.contextId,
      dataFile: 'rsdoctor-data.json',
      module: 'src/live.ts',
    });
    const candidate = await explainDeadCodeCandidate(workspaceRoot, {
      contextId: context.contextId,
      dataFile: 'rsdoctor-data.json',
      module: '3',
    });
    const preserved = await explainDeadCodeCandidate(workspaceRoot, {
      contextId: context.contextId,
      dataFile: 'rsdoctor-data.json',
      module: 'polyfill',
    });

    expect(reachable.classification).toBe('reachable');
    expect(reachable.paths).toEqual([
      {
        rootKind: 'production-entry',
        modules: [
          {
            id: '1',
            path: 'src/index.ts',
            name: './src/index.ts',
            chunks: ['10', 'shared'],
          },
          { id: '2', path: 'src/live.ts', name: 'live', chunks: ['10'] },
        ],
      },
    ]);
    expect(candidate.classification).toBe('unreachable-module-candidate');
    expect(candidate.state.productionReachability).toBe('unreachable');
    expect(preserved.classification).toBe('preserved-by-conservative-root');
    expect(preserved.state.optimizerRetention).toBe('side-effect');
  });
});

test('returns insufficient evidence rather than unreachable when the requested depth truncates', async () => {
  await withFixtureWorkspace('application', async (workspaceRoot) => {
    const context = {
      contextId: 'ctx_app',
      packageRoot: '.',
      product: 'application',
    } as const;
    await recordBuild(workspaceRoot, context, 'run_app', '2026-08-12T04:00:01.000Z');

    const result = await explainDeadCodeCandidate(workspaceRoot, {
      contextId: context.contextId,
      dataFile: 'rsdoctor-data.json',
      module: 'src/cycle-a.ts',
      maxDepth: 1,
    });

    expect(result.classification).toBe('insufficient-evidence');
    expect(result.state.productionReachability).toBe('unknown');
    expect(result.bounds).toContain('production-traversal-truncated');
  });
});

test('traces artifact-local dependent impact to product roots and emitted chunks', async () => {
  await withFixtureWorkspace('application', async (workspaceRoot) => {
    const context = {
      contextId: 'ctx_app',
      packageRoot: '.',
      product: 'application',
    } as const;
    await recordBuild(workspaceRoot, context, 'run_app', '2026-08-12T04:00:01.000Z');

    const result = await traceModuleImpact(workspaceRoot, {
      contextId: context.contextId,
      dataFile: 'rsdoctor-data.json',
      module: '2',
    });

    expect(result.direction).toBe('dependents');
    expect(result.modules.map(({ id }) => id)).toEqual(['2', '1']);
    expect(result.reachedRoots.map(({ kind, module }) => [kind, module.id])).toEqual([
      ['production-entry', '1'],
    ]);
    expect(result.affectedChunks).toEqual(['10', 'shared']);
    expect(result.totalVisited).toBe(2);
    expect(result.returned).toBe(2);
    expect(result.truncated).toBe(false);
  });
});

test('rejects unknown contexts, ambiguous selectors, and invalid query bounds', async () => {
  await withFixtureWorkspace('application', async (workspaceRoot) => {
    const context = {
      contextId: 'ctx_app',
      packageRoot: '.',
      product: 'application',
    } as const;
    await recordBuild(workspaceRoot, context, 'run_app', '2026-08-12T04:00:01.000Z');

    await expect(
      readProductRoots(workspaceRoot, {
        contextId: 'ctx_missing',
        dataFile: 'rsdoctor-data.json',
      }),
    ).rejects.toThrow('Unknown context: ctx_missing');
    await expect(
      explainDeadCodeCandidate(workspaceRoot, {
        contextId: context.contextId,
        dataFile: 'rsdoctor-data.json',
        module: 'cycle',
      }),
    ).rejects.toThrow('Unknown module selector: cycle');
    await expect(
      findUnusedCandidates(workspaceRoot, {
        contextId: context.contextId,
        dataFile: 'rsdoctor-data.json',
        limit: 0,
      }),
    ).rejects.toThrow('limit must be an integer from 1 to 100.');
    await expect(
      traceModuleImpact(workspaceRoot, {
        contextId: context.contextId,
        dataFile: 'rsdoctor-data.json',
        module: '2',
        maxDepth: 17,
      }),
    ).rejects.toThrow('maxDepth must be an integer from 1 to 16.');

    await writeFile(
      path.join(workspaceRoot, 'rsdoctor-data.json'),
      JSON.stringify({
        data: {
          moduleGraph: {
            modules: [
              { id: 1, path: 'src/index.ts', name: 'index', isEntry: true },
              { id: 2, path: 'src/a/shared.ts', name: 'shared' },
              { id: 3, path: 'src/b/shared.ts', name: 'shared' },
            ],
            dependencies: [],
          },
        },
      }),
    );
    await expect(
      explainDeadCodeCandidate(workspaceRoot, {
        contextId: context.contextId,
        dataFile: 'rsdoctor-data.json',
        module: 'shared',
      }),
    ).rejects.toThrow('Ambiguous module selector: shared');
  });
});
