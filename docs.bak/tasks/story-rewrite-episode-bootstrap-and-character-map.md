# Story Rewrite, Episode Bootstrap, and Character Map

## Objective

Extend the existing story rewrite and localization pipeline so a single CLI entry point can:

- rewrite an English full-length horror story into an improved English full story;
- generate localized full stories and Shorts from that source;
- bootstrap a new episode from an external Markdown source file when requested;
- extract, persist, and reuse a shared character map for downstream workflows.

The implementation must reuse the repo’s current episode filesystem, logging, OpenAI, manifest, cost-accounting, and CLI conventions.

## Repository findings

- The repository already has a canonical episode workspace under `episodes/<episode-slug>/`.
- Story localization already has structured-output, retry, validation, and cost-tracking helpers in `packages/story-localization`.
- Short-form rewriting already exists in `packages/story-localization/src/short-rewrite.*` and is wired into `apps/cli/src/story-short-rewrite-command.ts`.
- The current localization pipeline copies the English full source through unchanged, so it does not yet satisfy the “optimized English full story” rewrite requirement.
- Shared character-registry support already exists in `packages/image-generation/src/episode-image-pipeline.ts` and is persisted under `episodes/<episode-slug>/shared/characters.json`.
- Episode bootstrap and sync commands already exist in `apps/cli/src/episode-commands.ts`.
- The workspace already has atomic filesystem helpers, episode path helpers, and story parsing utilities in `packages/shared`.

## Architectural decisions

- Add a dedicated `stories rewrite-full` CLI entry point rather than overloading unrelated episode commands.
- Reuse the existing `@mediaforge/story-localization` OpenAI and validation stack instead of creating a second client or prompt path.
- Keep character map state in the canonical shared episode folder and only extract it when no valid shared registry exists.
- Treat external Markdown input as a bootstrap path for a new episode workspace only when the caller explicitly supplies `--input` plus `--episode-slug`.
- Keep output paths deterministic and portable so downstream image, audio, and upload workflows can consume them without special-case logic.

## Tasks

### Task 1 — Shared episode identity and path resolution

- [x] Extend the shared episode path helpers to resolve source, shared, and generated folders consistently for both existing episodes and bootstrapped episodes.
- [x] Add canonical helpers for episode slug, episode number, and output path generation for full and short story artifacts.
- [x] Add path traversal guards and portable relative path helpers for all new filesystem writes.

### Task 2 — Markdown source importer

- [x] Add explicit source-file import resolution for `--input` paths.
- [x] Parse episode number and slug from the imported Markdown when bootstrapping a new episode.
- [x] Validate that the imported file is an English full-length source, not an existing Short.
- [x] Preserve the imported source file unchanged.

### Task 3 — Transactional episode bootstrap

- [x] Create the episode workspace if it does not exist.
- [x] Persist bootstrap metadata without corrupting existing manifests.
- [x] Keep bootstrapping idempotent so reruns can safely resume.

### Task 4 — Full-story rewrite integration

- [x] Add `stories rewrite-full` to the CLI help and register it beside the existing story commands.
- [x] Route the command through the story-localization pipeline with explicit input/episode-slug handling.
- [x] Support requested output languages, overwrite protection, resume behavior, dry-run, and JSON summaries.
- [x] Ensure the English optimized full story and localized full stories are written into the canonical episode output layout.

### Task 5 — Character-map discovery and extraction

- [x] Detect existing shared character registries before attempting extraction.
- [x] Extract a character map from the optimized English full story when no valid registry exists.
- [x] Validate the extracted character map against the shared image-generation schema.
- [x] Persist the shared character map to `episodes/<episode-slug>/shared/characters.json`.

### Task 6 — Short-story rewrite integration

- [x] Keep the existing `stories rewrite-short` command available.
- [x] Make the short rewrite reuse the shared episode source resolution and any available character-map metadata.
- [x] Keep the short output layout deterministic and resumable.

### Task 7 — Validation and repair

- [x] Preserve strict structured output for short generation.
- [x] Validate source, target, and metadata fields before writing outputs.
- [x] Keep retry and repair behavior bounded.

### Task 8 — Manifests, usage, and cost tracking

- [x] Update episode manifests atomically after a successful run.
- [x] Preserve token and cost accounting for each request.
- [x] Keep metadata portable by storing relative paths where possible.

### Task 9 — Tests

- [x] Add focused unit tests for language parsing, path resolution, output naming, and short rewrite validation.
- [x] Add service tests for dry-run, resume, overwrite, repair, and partial-failure behavior.
- [x] Add CLI tests for help output and command registration.

### Task 10 — Documentation

- [x] Update the CLI docs to describe the new rewrite and bootstrap flows.
- [x] Document the shared character map location and the episode bootstrap sequence.
- [x] Add runnable examples for both existing episodes and new external Markdown imports.

## Validation commands

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- focused `vitest` runs for story-localization and CLI command tests
- CLI help output for the new story commands

## Risks and assumptions

- The repository already has a canonical shared character registry schema, so the new bootstrap step should adapt to that schema rather than inventing a second one.
- The exact full-story rewrite prompt may need a future refinement pass if the source formatting changes significantly.
- Repository-wide lint and test failures outside the touched story-rewrite area should be treated as pre-existing unless they are clearly caused by this work.
