# Rslint Migration

Read this reference when the project uses `@rslint/core`, `rslint.config.*`, `rslint` commands, or Rslint config imports.

## Steps

1. Replace the `rslint` executable prefix with `rs lint`. For example, replace `rslint --fix` with `rs lint --fix`.
2. Move the old config into `define.lint`, replacing Rslint's `defineConfig()` wrapper and import. Receive `@rslint/core` exports from the factory parameter.
3. Replace custom `--config` paths with the migrated `rstack.config.*` path.
4. Remove `@rslint/core` only when no uncovered direct runtime API remains. Delete `rslint.config.*`.

## Config Pattern

```ts
import { define } from 'rstack';

define.lint(({ js, ts }) => [js.configs.recommended, ts.configs.recommendedTypeChecked]);
```

Preserve existing presets and rules during migration.

## Script Pattern

If a script also runs Prettier, migrate its formatting command as described in [prettier.md](prettier.md).

```json
{
  "scripts": {
    "lint": "rs lint && rs fmt --check",
    "lint:write": "rs lint --fix && rs fmt"
  }
}
```

## Validate

Run lint without writes. If Rstack upgrades Rslint, preserve the pre-migration lint baseline: disable newly enabled rules instead of changing source code, unless code changes are requested.
