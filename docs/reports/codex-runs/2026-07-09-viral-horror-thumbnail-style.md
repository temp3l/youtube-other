# Viral Horror Thumbnail Style

Date: 2026-07-09
Commit: 9e3ba73

Changed paths: `.env.example`, `apps/cli/src/thumbnail-commands.ts`, `apps/cli/src/thumbnail-commands.unit.test.ts`, `apps/cli/src/youtube-upload-thumbnail.ts`, `apps/cli/src/youtube-upload-thumbnail.unit.test.ts`, `docs/cli.md`, `packages/image-generation/src/story-thumbnail.ts`, `packages/image-generation/src/story-thumbnail.unit.test.ts`, `packages/image-generation/src/thumbnail-contracts.ts`, `packages/image-generation/src/thumbnail-image-generator.ts`, `packages/image-generation/src/thumbnail-prompt-compiler.ts`, `packages/image-generation/src/thumbnail-text-compositor.ts`, `prompts/youtube-metadata.prompt.md`.

Summary: Added `viral-horror-v1` as the default thumbnail preset, strengthened background prompts for viral horror composition, required native 9:16 Shorts composition, fixed collapsed visual spaces by rendering each word as a positioned SVG text element, increased viral typography weight/outline/shadow/distress, updated upload auto-generation, and tightened metadata prompt guidance for German hooks.

Tests: `pnpm test:focused -- packages/image-generation/src/story-thumbnail.unit.test.ts`; `pnpm test:focused -- apps/cli/src/thumbnail-commands.unit.test.ts`; `pnpm test:focused -- apps/cli/src/youtube-upload-thumbnail.unit.test.ts`; `pnpm --filter @mediaforge/image-generation typecheck`; `git diff --check -- ...`.

Risks: No live provider thumbnail generation was run; actual OpenAI outputs may still need visual review.
