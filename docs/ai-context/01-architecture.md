# AI Context: Architecture

## High-Level Architecture

`apps/cli` orchestrates package-level use cases. Packages own domain logic and artifact contracts; the CLI should not invent schemas or path layouts.

- `packages/shared`: path resolver, locale/variant normalization, authored-script resolver, atomic IO.
- `packages/domain`: zod schemas and domain contracts for episodes, scenes, shots, visual retention.
- `packages/config`: runtime/env config and defaults.
- `packages/story-localization`: full/short story generation, localization, prompt contracts, workflow manifests.
- `packages/image-generation`: image prompts, scene/reference assets, OpenAI image batches, import/resume.
- `packages/speech`: narration segmentation, TTS request/assembly/cache/quality gates.
- `packages/rendering`: FFmpeg rendering, filter builders, render-motion presets/reports.
- `packages/visual-planning`: shot plans, validation, preview/migration.
- `packages/metadata`: YouTube metadata generation.
- `packages/youtube-upload`: publication boundary and upload reports.
- `packages/observability`: telemetry, pricing, visual-retention savings.

## Data Flow

1. Authored scripts resolve from canonical episode paths.
2. Story localization creates/validates English full, localized full, and short artifacts.
3. Scene extraction/visual planning produces scenes, visual models, prompts, image jobs, and shot plans.
4. Image generation prepares full/short/reference assets and batch manifests.
5. Speech creates narration segments, audio, manifests, and quality reports.
6. Rendering consumes scenes/images/audio/captions/metadata and writes videos/manifests.
7. Metadata/upload prepare YouTube metadata and publication reports.

## Critical Invariants

- Locale codes are `en`, `de`, `es`, `fr`, `pt`; legacy `sp` is invalid.
- Content variants are `full` and `short`.
- Canonical authored scripts are under `episodes/<episode>/languages/script-<locale>.md` and `episodes/<episode>/languages/short/script-<locale>.md`.
- Use `createEpisodePathResolver` for episode paths.
- Do not write generated assets unless explicitly requested.
- Provider/API calls need explicit approval unless using mocks/dry-run.
- `stories pipeline` must remain documented as dry-run-only until executable orchestration is actually wired.

## Inspect Before Editing

- CLI commands: `apps/cli/src/index.ts`, command module, matching `*.unit.test.ts`.
- Story workflow: `packages/story-localization/src/story-workflow.types.ts`, `story-workflow.schemas.ts`, `story-workflow-planner.ts`, affected wrapper/test.
- Authored paths: `packages/shared/src/episode-filesystem.ts`, `packages/shared/src/episode-filesystem.unit.test.ts`.
- Image batches: `packages/image-generation/src/image-batch.types.ts`, `image-batch-planner.ts`, `image-batch-service.ts`, matching tests, `docs/cli-batch-images.md`.
- Rendering/motion: `packages/rendering/src/index.ts`, `packages/rendering/src/motion/*`, `apps/cli/src/render-motion-options.ts`.
- Shots: `apps/cli/src/shots.ts`, `packages/visual-planning/src/*`, `packages/domain/src/visual-retention/*`.
- Provider/upload: `packages/config/src/index.ts`, provider package, CLI command, docs.
