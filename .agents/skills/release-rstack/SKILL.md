---
name: release-rstack
description: Create a coordinated release pull request for the `rstack` and `create-rstack` npm packages. Use when asked to prepare, create, or open an rstack package release PR.
---

# Release Rstack

## Input

- Target version without a leading `v`, for example `1.2.0`.

If the version is missing, ask for it before making changes.

## Version rules

- Read both package versions before editing. Require the rstack target to be a valid, increasing SemVer version.
- Keep the package version lines independent. Apply the rstack bump type to the current `create-rstack` version:
  - Patch: increment the patch version.
  - Minor: increment the minor version and reset patch to `0`.
  - Prerelease: use the rstack target's identifier. From a stable version, increment patch and append `-<identifier>.0`; otherwise increment the final prerelease number.
  - Prerelease to stable with the same core version: remove the `create-rstack` prerelease suffix.
- Stop and ask the user for major or ambiguous changes.

## Steps

1. Check the worktree with `git status --short`. If there are uncommitted changes or untracked files, stop and ask the user how to proceed. Do not stash, discard, or include them.

2. Confirm the current branch is the repository's default branch. Set the release branch to `release/v<version>` and check both local and remote branches. If it already exists, stop and ask the user how to proceed.

3. Create and switch to `release/v<version>` from the clean default-branch HEAD.

4. Update the `version` field in `packages/rstack/package.json` to `<version>` and the `version` field in `packages/create-rstack/package.json` to the derived `create-rstack` version.

5. In every `packages/create-rstack/template-*/package.json`, set the `rstack` dependency to `^<version>`. Update only that dependency entry and verify every template package manifest uses the same target version.

6. Run `pnpm --filter rstack build:native` to regenerate `packages/rstack/binding.cjs` and `packages/rstack/binding.d.cts` for the new version. Do not edit generated binding files manually.

7. Review the diff and confirm it contains only both package version changes, the template `rstack` dependency updates, and the regenerated binding files above. Verify the two package version changes use the intended matching bump type and no template retains an older rstack version.

8. Create a commit with this exact message: `release: v<version>`.

9. Push the branch to `origin`. Recheck that the branch being pushed is `release/v<version>` and never push the default branch directly.

10. Create a pull request against the default branch. In Codex, use the GitHub connector/plugin; use another available GitHub workflow only when the connector is unavailable. Use `release: v<version>` as the PR title.

Return the pull request URL.
