# Repository-Wide Code Review Report

Date: 2026-07-08

## Executive Summary

The repo has strong pieces for refactor readiness: a shared path resolver, many Zod schemas, focused Vitest coverage, image batch integrity checks, render manifests, and a command guard that discourages broad verification. The production boundary is still uneven. The highest-risk areas are path layout drift, render-time creation of missing audio, secret-bearing telemetry, provider/remote JSON validation, filesystem containment, and ambiguous full/short/localized asset identity.

Findings: 4 Critical, 10 High, 8 Medium, 2 Low.

## Review Scope

Reviewed `package.json`, `pnpm-workspace.yaml`, workspace package manifests, `apps/cli`, `packages/shared`, `packages/story-localization`, `packages/dark-truth`, `packages/image-generation`, `packages/rendering`, `packages/speech`, `packages/transcription`, `packages/metadata`, `packages/youtube-upload`, `packages/process-runner`, `scripts/remote-render-worker.mjs`, and representative tests. Generated media trees, archives, `docs.bak`, and root `README.md` were not used for architecture guidance.

## Repository Structure And Commands

This is a private `pnpm` monorepo. `apps/cli` is the operational surface, with `node apps/cli/bin/mediaforge.js` wrapped by telemetry in root scripts.

Production-relevant commands:

- `pnpm mediaforge -- ...`
- `pnpm episode:*`
- `pnpm stories:localize`
- `pnpm stories:batches`
- `pnpm images:plan`
- `pnpm images:generate`
- `pnpm render`
- `pnpm render:remote:*`
- `pnpm transcript:*`
- `pnpm metadata:youtube`
- `pnpm youtube:upload`
- `pnpm youtube:auth`

Development/verification commands:

- `pnpm test:focused -- <test-file>`
- `pnpm exec vitest run -c <config> --bail=1 <test-file>`
- `pnpm --filter <package> typecheck`
- `pnpm lint:affected`
- `pnpm docs:diagrams:check`

Broad or risky commands:

- `pnpm build`, `pnpm test`, `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm typecheck`, and `pnpm format` are broad.
- Live provider/upload/remote commands require explicit operator intent.
- Built `dist` trees exist for apps and packages; treat them as stale until an authorized build verifies them.

## Confirmed Critical Findings

- CR-001: Story rewrite/localization writes generated scripts to `script.md`, `en/full/script.md`, and `<locale>/full/script.md`, while the shared authored resolver uses `episodes/<slug>/languages/script-<locale>.md`. Evidence: `packages/story-localization/src/canonical-full-story.persistence.ts:203`, `packages/story-localization/src/story-localization.service.ts:1926`, `apps/cli/src/story-full-rewrite-command.ts:177`, `apps/cli/src/story-localization-commands.ts:212`.
- CR-002: `packages/rendering/src/index.ts:2262` slices `narration.wav` into scene audio during render. Render should fail on missing audio/timeline inputs, not synthesize them.
- CR-003: `packages/process-runner/src/index.ts:97` records process args; curl callers include `Authorization: Bearer ...` in args at `packages/metadata/src/youtube-metadata.ts:270` and `packages/image-generation/src/openai-image.ts:552`.
- CR-004: `packages/shared/src/episode-filesystem.ts:959` and `:996` join caller-provided generated-image filenames without basename validation.

## Confirmed High Findings

- CR-005: `stories pipeline` is dry-run only (`apps/cli/src/story-pipeline-command.ts:62`) and workflow fingerprints are synthetic (`packages/story-localization/src/story-workflow-planner.ts:53`).
- CR-006: Locale support is inconsistent: shared workflow includes `pt`; Dark Truth parser does not.
- CR-007: `apps/cli/src/index.ts` directly imports config, provider, render, upload, persistence, filesystem, speech, transcription, and image-generation services.
- CR-008/CR-009: `packages/image-generation/src/image-batch-service.ts` mixes OpenAI batch lifecycle with orchestration and casts provider/manifest shapes.
- CR-010: Short shared portrait aliasing lacks visual intent identity.
- CR-011/CR-014: Remote render worker/job/result handling and cleanup need stronger schemas and guards.
- CR-012: Subtitle filter paths are interpolated into FFmpeg filter syntax.
- CR-013: Shot source images may be absolute external paths.

## Confirmed Medium Findings

See `finding-register.md` for CR-015 through CR-022. The recurring medium-risk pattern is compatibility fallback logic acting as pipeline state: scanning files, parsing JSON with casts, and relying on stale `dist`/source package contracts.

## Confirmed Low Findings

CR-023 and CR-024 are cleanup/documentation issues: legacy tests are mixed with current behavior, and command risk classification is implicit.

## Suspected Issues Requiring Verification

- Whether live YouTube upload paths always pass explicit `overrides.videoPath`; the code supports manifest-first selection but still scans render folders.
- Real OpenAI image edit batch JSONL semantics; code intentionally blocks reference-assisted edit batches pending provider verification.
- Remote render partial-result behavior when metadata exists but output/log retrieval fails.
- Whether all current episodes have reconciled `languages/script-<locale>.md` authored inputs versus generated narration scripts.

## Architectural Observations

The most important boundary is `packages/shared/src/episode-filesystem.ts`; refactors should strengthen it, not bypass it. Domain packages mostly avoid provider imports, but `apps/cli` and `packages/dark-truth` still aggregate many infrastructure concerns. Rendering is relatively well tested but still accepts too much late-bound filesystem state. Image batches have strong retry/import tests, but provider-specific behavior is not isolated enough.

## Recommended Refactor Order

1. Add characterization tests.
2. Harden path resolution and containment.
3. Add manifest/provider/remote schemas.
4. Redact telemetry and remove unsafe casts at boundaries.
5. Introduce executable pipeline stage contracts.
6. Stabilize localization/shared asset identity.
7. Split image provider adapters.
8. Harden render and remote render contracts.
9. Clean legacy compatibility after tests.
10. Run final focused verification gates.

## Areas Not Reviewed Or Insufficient Evidence

No real provider calls, YouTube uploads, FFmpeg full production renders, remote host operations, broad builds, broad tests, or fixture regeneration were run. Existing media artifacts and generated assets were not audited.
