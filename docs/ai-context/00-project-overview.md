# AI Context: Project Overview

Date refreshed: 2026-07-07

## Purpose

`mediaforge` is a private TypeScript media-production monorepo for turning episode/story assets into localized scripts, images, narration, rendered videos, metadata, and YouTube upload artifacts. The primary operational surface is `apps/cli`.

## Repo Shape

- Package manager: `pnpm@10.16.0`.
- Runtime: Node `>=22`.
- Module system: ESM, `NodeNext`, strict TypeScript.
- Main app: `apps/cli`.
- Other apps: `apps/api`, `apps/web`.
- Core packages: `packages/shared`, `packages/domain`, `packages/config`, `packages/story-localization`, `packages/image-generation`, `packages/speech`, `packages/rendering`, `packages/metadata`, `packages/youtube-upload`, `packages/visual-planning`, `packages/observability`, `packages/dark-truth`.

## Current State

The worktree is dirty. Recently changed areas include:

- Story workflow wrappers: `packages/story-localization/src/story-workflow-*.ts`.
- Image batch planner/import behavior: `packages/image-generation/src/image-batch-planner.ts`, `packages/image-generation/src/openai-image.ts`.
- Render motion CLI/manifest behavior: `apps/cli/src/index.ts`, `apps/cli/src/render-motion-options.ts`, `packages/rendering/src/index.ts`, `packages/rendering/src/motion/*`.
- Post-refactor smoke fixes: `apps/cli/src/env-setup.ts`, `apps/cli/src/shot-commands.unit.test.ts`.
- Operator docs and implementation reports under `docs/reports/2026-07-07/`.

## Important Status

- Story pipeline executable orchestration is still a dry-run skeleton at CLI level.
- Story workflow Tasks 05-10 are implemented as manifest-persisted wrappers in the dirty tree.
- FFmpeg render-motion CLI flags are implemented in the dirty tree, but package `dist` may be stale until build.
- Short multilingual image alias policy is implemented in the dirty tree.
- Provider edit-batch semantics for `/v1/images/edits` remain unverified and intentionally blocked.
- Post-refactor controlled smoke is partial: focused tests/typechecks passed, but `episode validate` and `shots validate` failed on stale/invalid repository episode artifacts.
