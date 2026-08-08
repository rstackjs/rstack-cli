# Getting started

## Project structure

After creating a documentation project with `create-rstack`, you will get the following project structure:

- `docs/` — The documentation source directory, configured via `root` in `rstack.config.ts`.
- `docs/_nav.json` — The navigation bar configuration.
- `docs/guide/_meta.json` — The sidebar configuration for the guide section.
- `rstack.config.ts` — The Rstack configuration file, including the Rspress configuration registered with `define.doc()`.

## Development

Start the local development server:

```bash
{{ packageManager }} run dev
```

:::tip

You can specify the port number or host with `--port` or `--host`, such as `rs doc --port 8080 --host 0.0.0.0`.

:::

## Production build

Build the site for production:

```bash
{{ packageManager }} run build
```

By default, Rspress will output to the `doc_build` directory.

## Preview

Preview the production build locally:

```bash
{{ packageManager }} run preview
```

## Next steps

- Explore the full [Rspress documentation](https://rspress.rs/) for advanced features.
