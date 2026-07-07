# Batch Image Architecture Audit

## Executive Summary

Outcome: **A - Implemented with explicit safeguards**.

The repository contains a complete source-registered `images batch` workflow:
`prepare`, `submit`, `status`, `download`, and `resume` are implemented in
`apps/cli/src/images-batch-commands.ts`, with planner, service, identity, and
resolver support in `packages/image-generation` and `packages/shared`.

The workflow now covers:

- full-scene image batches
- multilingual full-scene shared-output aliasing
- short native generation batches
- local deterministic short transforms and reuse
- reconciliation, validation, and retry lineage

Reference-assisted batch image edits are not treated as provider-safe. They are
blocked during `prepare` with `unsupported-edit-batch-request` until the manual
verification checklist in
`docs/plans/cli-batch-images/provider-reference-semantics-checklist.md` is
completed and the implementation is intentionally widened.

## Components Inspected

- CLI surfaces: `apps/cli/src/index.ts`,
  `apps/cli/src/images-batch-commands.ts`,
  `apps/cli/src/images-resume-command.ts`
- Image generation: `packages/image-generation/src/image-batch-planner.ts`,
  `packages/image-generation/src/image-batch-service.ts`,
  `packages/image-generation/src/image-batch-normalization.ts`,
  `packages/image-generation/src/image-batch.schemas.ts`,
  `packages/image-generation/src/image-batch.types.ts`,
  `packages/image-generation/src/shorts-image-strategy.ts`,
  `packages/image-generation/src/episode-image-pipeline.ts`
- Rendering and paths: `packages/rendering/src/index.ts`,
  `packages/shared/src/episode-filesystem.ts`
- Tests:
  `apps/cli/src/images-batch-commands.unit.test.ts`,
  `packages/image-generation/src/image-batch-planner.unit.test.ts`,
  `packages/image-generation/src/image-batch-service.unit.test.ts`,
  `packages/image-generation/src/shorts-image-strategy.unit.test.ts`,
  `packages/rendering/src/index.unit.test.ts`

## Implemented Full-Image Flow

1. `images batch prepare` resolves the episode workspace and loads batch
   settings.
2. `prepareFullSceneImageBatches` creates reference stages and full-scene
   generation groups for one or more selected languages.
3. Canonical full-scene outputs remain shared under
   `shared/images/generated/`.
4. When multiple languages target the same canonical full-scene path, the
   planner compares provider request hash, generation configuration hash,
   operation, output format, and dependency hashes.
5. If those fields match, one deterministic owner item emits the provider JSONL
   line and the remaining items become alias followers in the manifest.
6. If those fields differ, preparation fails before any write or submission.
7. `images batch submit` uploads one prepared JSONL input and creates the remote
   batch.
8. `images batch download` imports completed owner results, validates them, and
   mirrors the persisted metadata to alias followers.
9. `images batch resume` prepares a retry batch only for retryable owner items.

## Implemented Short-Image Flow

1. `prepareShortSceneImageBatches` loads the localized short scene plan.
2. `planShortsImageWork` classifies each scene as native generation,
   deterministic transform, reuse, or blocked.
3. Native portrait generations become provider JSONL lines.
4. Deterministic transforms and direct reuse stay local and are written only to
   `shorts-local-work.<language>.json`.
5. `images batch prepare --variants short --json` reports paid native generation
   counts separately from local deterministic transforms, cache reuse, and
   blocked items.
6. Imported short images update `shared/short/images/generated/` and
   `shorts-image-manifest.json`.
7. Short retry preparation includes only failed native generation items and
   ignores local-only transform or reuse entries.

## API Endpoint Verification

- Text-only batch image generation uses `/v1/images/generations`.
- The planner never routes image generation through `/v1/responses`.
- Synchronous reference-assisted generation still uses `client.images.edit(...)`
  when references are present.
- Batch reference-assisted edit requests are blocked as manual-only because the
  repository does not prove the JSONL request body semantics for image inputs on
  `/v1/images/edits`.

## Capability Matrix

| Capability                                         | Full video | Short video | Status           |
| -------------------------------------------------- | ---------- | ----------- | ---------------- |
| CLI batch commands exist                           | Yes        | Yes         | Complete         |
| Prepare is local-only                              | Yes        | Yes         | Complete         |
| Submit is the only paid batch creation step        | Yes        | Yes         | Complete         |
| Multilingual same-path aliasing                    | Yes        | N/A         | Complete         |
| Unsafe same-path collision rejection               | Yes        | N/A         | Complete         |
| Reference-assisted batch edit requests             | Blocked    | Blocked     | Manual-only      |
| Deterministic short transforms stay local          | N/A        | Yes         | Complete         |
| Canonical output paths are resolver-backed         | Yes        | Yes         | Complete         |
| Order-independent reconciliation                   | Yes        | Yes         | Complete         |
| Duplicate and unknown custom ids are detected      | Yes        | Yes         | Complete         |
| Retry lineage is preserved                         | Yes        | Yes         | Complete         |
| Resume avoids alias/local-only duplicate paid work | Yes        | Yes         | Complete         |
| Multi-language short batch in one run              | No         | No          | Known limitation |

## Current Limitations

- Short batch preparation still supports one language per run because portrait
  outputs target shared canonical paths.
- Deterministic short transforms remain local and do not emit provider JSONL.
- Reference-assisted batch edits remain blocked until manual provider
  verification proves `/v1/images/edits` JSONL semantics for image inputs.
- The built CLI runtime at `apps/cli/bin/mediaforge.js` may lag the source tree
  until the CLI package is rebuilt.

## Evidence Notes

- `images batch prepare --variants full --languages en,de` can succeed when
  colliding full-scene outputs are represented as one owner item plus alias
  followers.
- Import writes both the canonical owner asset and follower manifest state for
  aliased full-scene items.
- Resume accepts an optional `--batch` and otherwise falls back to the latest
  retryable image batch in the local index.
- Short prepare output exposes `previewCounts` and `localWorkPlan` in JSON mode.

## Verification Strategy

Use focused Vitest runs, narrow package typechecks, and documentation checks
only. No production batch upload, polling, or paid image generation was
performed for this audit task.

## Remaining Risk Pointers

- Manual-only provider edit-batch verification:
  `docs/plans/cli-batch-images/provider-reference-semantics-checklist.md`
- Current implementation and workspace-risk triage:
  `docs/plans/cli-batch-images/remaining-risks-triage.md`
