# AGENTS

Use this repo as a `pnpm` monorepo with `apps/cli` as the primary operational surface. Inspect code before changing docs or behavior. Prefer `rg` and targeted file reads over broad scans.

Repository inspection rules:

- Ignore the root `README.md` for architecture guidance.
- Treat source code as authoritative when docs conflict.
- Read only the docs relevant to the current task; do not preload the full docs set.
- Treat `docs.bak/` as reference material only, never as the source of truth.
- Exclude large generated trees from routine search: `node_modules/`, `dist/`, `coverage/`, `episodes/**/output/`, `episodes/**/state/`, `episodes/**/generated-assets/`, `audio/`, `video/`, `images/`, `transcripts/`, `logs/`.

Execution and validation:

- Default to narrow, file-targeted validation.
- Prefer filtered Vitest, single-file ESLint, and path-existence checks over repo-wide runs.
- Do not default to `pnpm build`, `pnpm test`, full lint, or full typecheck for docs-only work.
- If validation fails, repair and retry at most two times, then report the remaining issue clearly.

Progress and completion output:

- State what you are inspecting before substantial work.
- Before edits, say which files you are changing and why.
- On completion, summarize the behavior or docs changed, note validation run, and call out anything not verified.

Documentation update policy:

- Update docs only when a task changes documented architecture, commands, configuration, or behavior.
- If a task does not change those surfaces, leave docs alone.

Documentation index:

- [Docs Index](docs/README.md)
- [System Overview](docs/architecture/system-overview.md)
- [Episode Production Pipeline](docs/architecture/episode-production-pipeline.md)
- [Story Localization](docs/architecture/story-localization.md)
- [Media Assets And Delivery](docs/architecture/media-assets-and-delivery.md)
