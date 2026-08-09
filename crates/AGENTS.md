# AGENTS.md

## Architecture

- Keep `rstack-binding` a thin Node/NAPI adapter
- Put reusable or domain logic in separate crates
- Coordinate binding changes with the private JS loader and its Rstest coverage

## Checks

Run from the repository root:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
pnpm --filter rstack build:native
```
