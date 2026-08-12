# Task 3 Report

Status: DONE

## Changes

- Stopped workspace discovery after processing the nearest `.git` root.
- Canonicalized an existing loaded Rsbuild or Rslib config path once before observer creation.
- Removed unused stats timings and replaced unbounded metadata intermediates with one-pass bounded
  asset, chunk, and chunk-file collectors while preserving `BuildMetadataFacet` output.
- Added high-cardinality valid/invalid metadata, ancestor-workspace, and symlinked-config fixtures.

## TDD evidence

- RED: `pnpm --filter rstack test run tests/context/build.test.ts` failed because `toJson`
  received `timings: true` in the existing lifecycle and new high-cardinality tests.
- RED: `pnpm --filter rstack test run tests/context/workspace.test.ts` failed because discovery
  returned the unrelated ancestor workspace instead of the nearest checkout root.
- RED: `pnpm --filter rstack test run tests/context/injection.test.ts -t 'canonicalizes a
symlinked loaded config path'` failed for both app and lib because no context run was captured.
- GREEN: focused build metadata tests passed (2 passed), workspace tests passed (5 passed), and
  symlinked app/lib injection tests passed (2 passed).

## Verification

- `pnpm check`: passed with 0 lint errors, 0 type errors, 0 warnings, and no formatting issues.
- Full assigned-file run: 24 of 26 tests passed. The two failures are pre-existing security/store
  fixtures (`treats a resolved manifest-store failure...` and `treats a resolved snapshot-store
failure...`) that also failed before implementation and are outside Task 3's no-security scope.

## Commit

`perf(rstack): bound passive build extraction`

## Concerns

The full build test file remains red only on the two out-of-scope security/store fixtures noted
above; Task 3 did not alter or expand those tests.
