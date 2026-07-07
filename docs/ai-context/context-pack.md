# Mediaforge AI Context Pack

Refreshed: 2026-07-07. Upload this file to ChatGPT before asking for new Codex prompts.

## Project Summary

`mediaforge` is a private `pnpm` TypeScript monorepo for media production: story rewrite/localization, image assets, narration, FFmpeg rendering, metadata, and YouTube upload. `apps/cli` is the primary operational surface.

## Current Repository State

The worktree is dirty. Recent modified areas: `apps/cli`, `packages/story-localization`, `packages/image-generation`, `packages/rendering`, CLI docs, and reports. New untracked reports exist under `docs/reports/2026-07-07/`; untracked archives exist under `content-ideas/`. Do not revert or clean unrelated files.

## Architecture Map

- CLI orchestration: `apps/cli/src/index.ts`, command modules.
- Paths/identity: `packages/shared/src/episode-filesystem.ts`.
- Schemas/domain: `packages/domain/src`.
- Runtime config/env: `packages/config/src/index.ts`.
- Story/localization/workflow: `packages/story-localization/src`.
- Images/batches: `packages/image-generation/src`.
- Narration/audio: `packages/speech/src`.
- Rendering/motion: `packages/rendering/src`.
- Shots/visual retention: `packages/visual-planning/src`.
- Metadata/upload: `packages/metadata/src`, `packages/youtube-upload/src`.

## Pipeline Map

Authored script -> story workflow/localization -> scene/visual planning -> image prompts/assets -> narration/captions -> render -> metadata -> upload.

`stories pipeline` currently plans/persists manifests only and requires `--dry-run`. Dirty-tree wrappers persist English rewrite, source fallback, quality, locale, short, and visual boundary outcomes, but not full executable orchestration.

## Refactor/Implementation State

Likely completed in dirty tree: story pipeline Tasks 05-10 wrappers, FFmpeg motion CLI/docs Tasks 07-09, short multilingual image alias policy, story Task 13 compatibility audit. Partial: post-refactor controlled smoke; focused tests/typechecks passed, but repository episode validation and shot validation failed on stale/invalid artifacts. Blocked: provider edit-batch support.

## Important Paths

- Canonical full script: `episodes/<episode>/languages/script-<locale>.md`.
- Canonical short script: `episodes/<episode>/languages/short/script-<locale>.md`.
- Locale/variant root: `episodes/<episode>/locales/<locale>/<variant>/`.
- Shared images: `episodes/<episode>/shared/images/generated/`.
- Shared short images: `episodes/<episode>/shared/short/images/generated/`.
- Image batch state: `episodes/<episode>/state/image-generation/.batch/`.
- Visual retention: `episodes/<episode>/state/visual-retention/`.
- Plans: `docs/plans/`.
- Codex reports: `docs/reports/codex-runs/`.

## Important CLI Commands

- `pnpm mediaforge -- episode dry-run --episode <id> --language en --artifact full --json`
- `pnpm mediaforge -- episode validate --episode <id> --language en --artifact full --json`
- `pnpm mediaforge -- stories pipeline --episode <id> --dry-run --json`
- `pnpm mediaforge -- images batch prepare --episode <id> --languages en --variants full --json`
- `pnpm mediaforge -- shots validate --episode <id> --locale en --variant full --format json`
- `pnpm mediaforge -- render <id> --dry-run --profile youtube`

Render motion flags in dirty tree: `--motion`, `--no-motion`, `--motion-mode`, `--motion-seed`, `--motion-debug`, `--motion-render-preset`.

## Verification Commands

Prefer `pnpm test:focused -- <test-file>`. Package typecheck examples: `pnpm --filter @mediaforge/story-localization typecheck`, `pnpm --filter @mediaforge/cli typecheck`. Docs-only minimum: `git diff --check -- <changed-docs>`.

Do not run broad tests/build/lint unless authorized. Do not run provider/API/upload/remote render commands without explicit approval.

## Known Risks And Open Tasks

- Dirty worktree needs review/commit discipline.
- Story pipeline Tasks 11-17 remain open/proven incomplete.
- Episode `022-the-whistler-in-the-woods` artifacts need reconciliation.
- Runtime `dist` may be stale until build.
- Provider edit-batch semantics are unknown.
- Older audits are stale in places; use newest reports plus source.

## Do Not Break

- Locale set: `en`, `de`, `es`, `fr`, `pt`; reject legacy `sp`.
- Variants: `full`, `short`.
- Use `createEpisodePathResolver`.
- Keep generated assets untouched unless requested.
- Keep secrets out of docs/reports.
- Do not make broad refactors or destructive git changes.

## Prompt-Writing Rules

Ask Codex to inspect this file, `AGENTS.md`, exact source/tests, and relevant plan/report files. Scope each prompt to one plan task or subsystem. Require focused verification and a Codex-run report. Require exact changed paths and unresolved risks in the final response.

## Recommended Model

Use GPT-5/Codex high reasoning for architecture, release stabilization, cross-package implementation, or provider-risk tasks. Use medium reasoning for one-package implementation. Use low/medium for docs-only cleanup.

## Files To Upload For Future Prompt Generation

Always upload this file plus `AGENTS.md`. Add task-specific files: relevant `docs/plans/*`, newest `docs/reports/2026-07-07/*`, affected source files, matching tests, and `package.json` if commands matter.
