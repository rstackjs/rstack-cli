---
name: release-rstack
description: Create a release pull request for the `rstack` npm package at a specific version. Use when asked to prepare, create, or open an rstack package release PR.
---

# Release Rstack

## Input

- Target version without a leading `v`, for example `1.2.0`.

If the version is missing, ask for it before making changes.

## Steps

1. Check the worktree with `git status --short`. If there are uncommitted changes or untracked files, stop and ask the user how to proceed. Do not stash, discard, or include them.

2. Confirm the current branch is the repository's default branch. Set the release branch to `release/v<version>` and check both local and remote branches. If it already exists, stop and ask the user how to proceed.

3. Create and switch to `release/v<version>` from the clean default-branch HEAD.

4. Update only the `version` field in `packages/rstack/package.json` to `<version>`.

5. Review the diff and confirm it contains exactly the one version-field change above.

6. Create a commit with this exact message: `release: v<version>`.

7. Push the branch to `origin`. Recheck that the branch being pushed is `release/v<version>` and never push the default branch directly.

8. Create a pull request against the default branch. In Codex, use the GitHub connector/plugin; use another available GitHub workflow only when the connector is unavailable. Use `release: v<version>` as the PR title.

Return the pull request URL.
