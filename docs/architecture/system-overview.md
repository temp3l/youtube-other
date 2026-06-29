# System Overview

## Scope

This repo is a `pnpm` monorepo targeting Node 22+, written in TypeScript, with root Vitest and ESLint entrypoints. The stable operational center is the CLI, not the legacy docs set or the root `README.md`.

## Applications

- `apps/cli` is the primary operator entry point. It wires commands for episode production, story localization, image work, rendering, metadata, uploads, and diagnostics.
- `apps/api` is a minimal HTTP wrapper that boots `@mediaforge/pipeline` and exposes a health-style JSON response with the resolved workspace path.
- `apps/web` is a minimal static page surface.

## Package Responsibilities

- Orchestration: `@mediaforge/cli`, `@mediaforge/dark-truth`, `@mediaforge/pipeline`
- Shared contracts and path ownership: `@mediaforge/domain`, `@mediaforge/shared`, `@mediaforge/config`, `@mediaforge/persistence`
- Media and content stages: `@mediaforge/story-localization`, `@mediaforge/speech`, `@mediaforge/transcription`, `@mediaforge/transcript-cleaning`, `@mediaforge/scene-planning`, `@mediaforge/image-generation`, `@mediaforge/rendering`, `@mediaforge/metadata`, `@mediaforge/youtube-upload`
- Support: `@mediaforge/observability`, `@mediaforge/process-runner`, `@mediaforge/testing`

## Primary Execution Model

- CLI commands orchestrate filesystem-first episode workflows.
- Shared path helpers own episode directory layout and compatibility fallbacks for canonical versus legacy asset locations.
- SQLite stores episode manifests, pipeline runs, and step runs, but generated filesystem artifacts remain the primary production state.
- Episode workspaces resolve under `workspaceDir`, which defaults to `./episodes`.

## External Systems

- OpenAI-compatible APIs are used across story rewriting, localization, speech, transcription, metadata, and image generation.
- `whisper.cpp` is an optional transcription provider.
- `ffmpeg` is the render backend.
- Remote rendering can use an SSH plus `rsync` worker and fall back to local rendering.
- YouTube upload uses `googleapis`.

## Config, Tests, and Generated State

- Runtime configuration is loaded from `.env`, process environment, CLI/runtime overrides, and optional episode-level `episode.config.json`.
- Tests live alongside source, with root `vitest.unit.config.ts`, `vitest.integration.config.ts`, and `vitest.e2e.config.ts`.
- Generated artifacts and mutable state live mainly under episode workspace directories plus the root SQLite database at `./.mediaforge.sqlite` by default.

## Source References

- `apps/cli/src/index.ts`
- `apps/api/src/index.ts`
- `apps/web/src/index.ts`
- `packages/config/src/index.ts`
- `packages/shared/src/episode-filesystem.ts`
- `packages/persistence/src/index.ts`
- `packages/pipeline/src/index.ts`
