# Foundation: characterization, stable identity, reference stages

Recommended model: GPT-5.4 for architecture/schema design; GPT-5.4-mini only for mechanical fixture cleanup after the schema is clear.

# Common execution rules for Codex

You are working in an existing TypeScript monorepo. Implement only the tasks in this prompt. Do not perform real OpenAI provider calls, do not upload files, and do not generate paid assets unless this prompt explicitly says otherwise.

Engineering constraints:
- Preserve the current synchronous image generation, short image, and renderer flows unless the task explicitly changes them.
- Keep changes type-safe and schema-validated.
- Prefer narrow, focused tests over broad repo-wide churn.
- Keep commits separate where requested by the source tasks.
- Do not clean unrelated workspace artifacts unless the task explicitly says to document them or provide safe cleanup guidance.
- Never route image generation through `/v1/responses`.
- Use `/v1/images/generations` only for text-only image generation requests.
- Treat reference-assisted `/v1/images/edits` batch semantics as unsupported unless the current task proves and gates them safely.

Before editing:
1. Inspect the current branch and worktree.
2. Read the relevant task files and repository evidence listed below.
3. Identify any unrelated local changes and avoid touching them.
4. Write or update characterization tests first when behavior is changing.

After editing:
1. Run the verification commands listed for the batch.
2. Record any failing commands with exact failure cause.
3. Summarize changed files, test results, remaining risks, and rollback notes.

## Source plan context

# CLI Batch Images Implementation Plan

## Audit Summary

Outcome: **B - Partially implemented**.

The repository has image batch primitives in `packages/image-generation/src/image-batch-planner.ts` and `packages/image-generation/src/image-batch-service.ts`, but they are not exposed through the canonical `images` CLI. The current batch schema is English/full scene-only, records reference-image hashes without submitting reference inputs, and does not cover short-video image generation.

Current canonical execution paths:

- Full scene images: synchronous `images plan`, `images generate`, and `images resume` through `episode-image-pipeline.ts`.
- Short images: `episode short` calls `prepareShortsImageAssets`, using deterministic portrait transforms plus optional synchronous native vertical generation.
- Batch image provider support: implemented as library functions, tested narrowly, but unreachable from CLI.

## Target Architecture

- Add a reachable `images batch` CLI workflow with `prepare`, `submit`, `status`, `download`, and `resume`.
- Keep the current non-legacy episode/image pipeline canonical and reuse its scene manifests, reference registry, prompt builders, validation, and shared output paths.
- Split image batch work into dependency-safe stages:
  1. reference asset planning/generation;
  2. reference approval or explicit unapproved-reference gate;
  3. full scene image batches;
  4. short portrait strategy planning;
  5. short native-generation batches only where deterministic conversion is insufficient;
  6. reconciliation, validation, and canonical placement.
- Use `/v1/images/generations` for text-only generation requests and `/v1/images/edits` only for request lines that actually include supported image inputs.
- Never route image generation through `/v1/responses`.

## Task Dependency Graph

```text
task-01-characterization-tests
  -> task-02-batch-types-and-identity
    -> task-03-reference-asset-stages
      -> task-04-full-scene-batch-workflow
        -> task-05-batch-lifecycle-cli
          -> task-06-reconciliation-validation-resume
            -> task-08-paths-renderer-integration
              -> task-09-operator-docs-and-smoke-verification
                -> task-10-provider-reference-safeguards
                  -> task-11-multilingual-full-scene-shared-output
                    -> task-12-short-batch-downstream-verification
                      -> task-13-remaining-risks-triage-and-docs

task-02-batch-types-and-identity
  -> task-07-short-image-strategy
    -> task-08-paths-renderer-integration
```

## Safe Execution Order

1. Characterize current behavior before changing implementation.
2. Generalize batch identity and manifest types.
3. Add reference asset stages and endpoint-safe request modeling.
4. Complete full scene batch preparation and provider submission.
5. Expose lifecycle commands in CLI.
6. Harden reconciliation, retry, resume, and validation.
7. Add short image batch/transform strategy.
8. Verify canonical paths and renderer consumption.
9. Update operator documentation and smoke checks.
10. Triage remaining worktree noise and lock provider-edit safeguards.
11. Enforce multilingual full-scene shared-output policy.
12. Verify short batch import/download/resume behavior end to end.
13. Record the remaining-risk status, manual checks, and safe cleanup guidance.

## Parallel Work

Tasks 03 and 05 may be prepared in parallel after Task 02, but Task 05 must not merge before full scene batch workflow behavior is stable. Task 07 may be designed in parallel with Task 04, but implementation must wait for shared identity and reference semantics from Tasks 02 and 03. Task 09 may draft documentation early, but final content must wait for Tasks 04-08. Tasks 10-13 should remain sequential because they harden the already-merged workflow against provider, path-sharing, and resume/import regressions.

## Sequential Work

Tasks 01, 02, 03, 04, 06, 08, 10, 11, 12, and 13 must remain sequential because each changes contracts or operational guidance consumed by later work.

## Expected Migrations

- Expand image batch manifests from English/full scene-only to language, variant, asset role, and dependency-aware identities.
- Preserve existing `state/image-generation` batch layout where possible.
- Keep existing scene manifests readable and add fields only when needed for batch reconciliation.
- Do not migrate or revive deprecated workbook/manual import paths.

## Rollback Considerations

- Each task must be committed separately with the commit message specified in the task file.
- CLI changes must be additive until the new batch workflow is proven.
- Existing synchronous `images generate` and `images resume` behavior must remain available as rollback.
- Manifest schema changes must be backward-compatible or include explicit migration/normalization.

## Verification Strategy

- Prefer focused tests: image batch planner, image batch service, short image strategy, CLI command registration, path resolution, and renderer image lookup.
- Do not submit OpenAI batches or generate paid assets in tests.
- Use fake OpenAI clients and local image fixtures.
- Run docs/diagram validation only for changed documentation.
- Do not submit real OpenAI batches or upload provider files unless a task
  explicitly adds a disabled-by-default manual checklist or smoke path.

## Completion Criteria

- `images batch prepare|submit|status|download|resume` exists and is documented.
- Full image batch workflow is reachable, resumable, and reconciles by stable identity.
- Reference-dependent scenes use a correct batch-compatible image endpoint and do not silently drop image inputs.
- Short image strategy explicitly chooses batch generation, reuse, or deterministic conversion per asset.
- Canonical render paths consume generated or transformed assets for full and short videos.
- Every task is implemented and committed separately.


## Current audit context

# Batch Image Architecture Audit

## Executive Summary

Outcome: **A - Implemented**.

The repository now contains a complete, source-registered `images batch` workflow:
prepare, submit, status, download, and resume are all implemented in
`apps/cli/src/images-batch-commands.ts`, with planner, service, identity, and
resolver support in `packages/image-generation` and `packages/shared`.

The workflow covers:

- full-scene image batches
- reference-image planning and reference-edit batches
- short native generation batches
- local deterministic short transforms and reuse
- reconciliation, validation, and retry lineage

## Components Inspected

- Package manifests and SDK surface: `package.json`, `apps/cli/package.json`,
  `node_modules/openai/package.json`, `node_modules/openai/resources/batches.d.ts`
- CLI surfaces: `apps/cli/src/index.ts`, `apps/cli/src/images-batch-commands.ts`,
  `apps/cli/src/images-resume-command.ts`, `apps/cli/src/images-sync-shared-command.ts`
- Image generation: `packages/image-generation/src/image-batch-planner.ts`,
  `packages/image-generation/src/image-batch-service.ts`,
  `packages/image-generation/src/image-batch-storage.ts`,
  `packages/image-generation/src/image-batch-identity.ts`,
  `packages/image-generation/src/image-batch-normalization.ts`,
  `packages/image-generation/src/shorts-image-strategy.ts`,
  `packages/image-generation/src/episode-image-pipeline.ts`
- Rendering and paths: `packages/rendering/src/index.ts`,
  `packages/shared/src/episode-filesystem.ts`
- Tests:
  `apps/cli/src/images-batch-commands.unit.test.ts`,
  `apps/cli/src/images-resume-command.unit.test.ts`,
  `packages/image-generation/src/image-batch-planner.unit.test.ts`,
  `packages/image-generation/src/image-batch-service.unit.test.ts`,
  `packages/image-generation/src/shorts-image-strategy.unit.test.ts`
- Documentation: `docs/cli-batch-images.md`, `docs/cli.md`,
  `docs/openai-api-endpoint-audit.md`

## Implemented Full-Image Flow

The canonical batch flow is now reachable from the CLI:

1. `images batch prepare` resolves the episode workspace and loads batch settings.
2. `prepareFullSceneImageBatches` creates reference stages, scene stages, and
   deterministic local batch ids.
3. Reference-assisted scenes use `/v1/images/edits` when OpenAI file ids are
   available.
4. Text-only scenes use `/v1/images/generations`.
5. `images batch submit` uploads one prepared JSONL input and creates the remote
   batch.
6. `images batch status` refreshes the provider lifecycle state.
7. `images batch download` imports completed results, validates them, and writes
   canonical outputs and manifests.
8. `images batch resume` prepares a retry batch only for retryable items.

## Implemented Short-Image Flow

Short image handling is now represented in the same batch identity and manifest
model:

1. `prepareShortSceneImageBatches` loads the localized short scene plan.
2. `planShortsImageWork` classifies each scene as native generation, deterministic
   transform, reuse, or blocked.
3. Native portrait generations become provider JSONL lines.
4. Deterministic transforms and direct reuse stay local.
5. Imported short images update `shared/short/images/generated` and
   `shorts-image-manifest.json`.
6. Short rendering consumes the canonical portrait outputs.

## API Endpoint Verification

- Installed OpenAI SDK in lockstep with the repo lockfile supports
  `/v1/images/generations` and `/v1/images/edits` in batch requests.
- `image-batch-planner.ts` emits generation and edit JSONL lines using those two
  endpoints only.
- The planner never routes image batches through `/v1/responses`.
- Synchronous reference-assisted generation continues to use `client.images.edit`
  when reference inputs are present.

## Capability Matrix

| Capability                                    | Full video | Short video | Evidence                                     | Status           |
| --------------------------------------------- | ---------- | ----------- | -------------------------------------------- | ---------------- |
| CLI batch commands exist                      | Yes        | Yes         | `apps/cli/src/images-batch-commands.ts`      | Complete         |
| Prepare is local-only                         | Yes        | Yes         | command handlers and unit tests              | Complete         |
| Submit is the only paid batch creation step   | Yes        | Yes         | submit handler and service tests             | Complete         |
| Reference-assisted edit batches are modeled   | Yes        | Yes         | planner tests and service types              | Complete         |
| Short deterministic transforms stay local     | N/A        | Yes         | `shorts-image-strategy.ts` and planner tests | Complete         |
| Canonical output paths are resolver-backed    | Yes        | Yes         | `packages/shared/src/episode-filesystem.ts`  | Complete         |
| Order-independent reconciliation              | Yes        | Yes         | service tests                                | Complete         |
| Duplicate and unknown custom ids are detected | Yes        | Yes         | service tests                                | Complete         |
| Retry lineage is preserved                    | Yes        | Yes         | service tests                                | Complete         |
| Deterministic splitting exists                | Yes        | Yes         | planner tests                                | Complete         |
| Multi-language full batch in one run          | No         | No          | planner guard                                | Known limitation |
| Multi-language short batch in one run         | No         | No          | planner guard                                | Known limitation |

## Current Limitations

- Full and short batch preparation support one language per run because outputs
  target shared canonical workspace paths.
- Deterministic short transforms remain local and do not emit provider JSONL.
- Reference-assisted scenes require resolved OpenAI file ids before batch
  submission.
- The built CLI binary in this workspace was not rebuilt during this documentation
  task, so `apps/cli/bin/mediaforge.js` may lag the source tree until the package
  is rebuilt.

## Evidence Notes

- `images batch` is registered in source and covered by focused unit tests.
- `resume` accepts an optional `--batch` and falls back to the latest retryable
  batch in the local index when omitted.
- `download` and `resume` both resolve manifests by local batch id or OpenAI batch
  id once a batch exists.
- Import writes both the canonical asset and the appropriate auxiliary manifest or
  registry update when needed.

## Verification Strategy

Use focused Vitest runs and documentation checks only. No production batch upload,
polling, or paid image generation was performed for this audit task.

## Smoke Verification

- `pnpm test:focused -- apps/cli/src/images-batch-commands.unit.test.ts packages/image-generation/src/image-batch-planner.unit.test.ts packages/image-generation/src/image-batch-service.unit.test.ts`
  passed: 3 files, 41 tests.
- `pnpm exec prettier --write docs/cli-batch-images.md docs/plans/cli-batch-images/batch-image-audit.md`
  normalized the new docs after `prettier --check` flagged them.
- `pnpm docs:diagrams:check` failed on pre-existing stale rendered assets:
  `docs/diagrams/rendered/story-artifact-lineage.{svg,png}` and
  `docs/diagrams/rendered/story-stage-state-machine.{svg,png}`.
- `node apps/cli/bin/mediaforge.js images --help` showed the workspace binary is
  still using a stale dist build and does not yet reflect the source-registered
  `images batch` subtree.

## Documentation Created

- `docs/cli-batch-images.md`
- `docs/plans/cli-batch-images/batch-image-audit.md`


## Tasks in this batch

---

## task-01-characterization-tests.md

# Task 01 - Characterization Tests

Recommended model: GPT-5.4 for test design and architecture reasoning; GPT-5.4-mini for fixture cleanup and mechanical assertions.

Commit after implementation: `test(image-batch): characterize current image workflows`

## Objective

Add focused tests that pin the current full image, short image, reference, and batch-library behavior before implementation changes.

## Background

Current image batch functions are tested in isolation, but there is no CLI-level characterization for a future `images batch` workflow and no test proving reference inputs are absent from current batch request lines.

## Scope

- Add tests for current image batch planner output.
- Add tests proving current batch custom IDs and manifests are English/full/scene-only.
- Add tests for current short strategy classification: regenerate, smart-crop, blurred-fill.
- Add tests documenting that reference-assisted synchronous generation uses image edit semantics.

## Out of scope

- No production behavior changes.
- No real OpenAI calls.
- No fixture regeneration outside narrow test fixtures.

## Dependencies

None.

## Repository evidence

- `packages/image-generation/src/image-batch-planner.unit.test.ts`
- `packages/image-generation/src/image-batch-service.unit.test.ts`
- `packages/image-generation/src/shorts-image-strategy.unit.test.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`

## Required changes

- Add or extend unit tests in `packages/image-generation/src`.
- Mock provider clients and image generators.
- Assert current limitations explicitly so later tasks update tests intentionally.

## Data model or manifest changes

None.

## CLI behavior

No CLI behavior changes.

## Error handling and observability

Test current error classifications for missing result lines, invalid dimensions, and reference approval failures where existing helpers expose them.

## Security and cost controls

Use fake clients only. Do not read secrets or submit provider requests.

## Tests

- Current full batch JSONL shape.
- Current reference hash tracking without request image input.
- Current short strategy manifest reuse.
- Current service reconciliation by `custom_id`.

## Verification commands

```bash
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm test:focused -- packages/image-generation/src/shorts-image-strategy.unit.test.ts
```

## Acceptance criteria

- Tests pass before production changes.
- Tests document limitations without weakening existing assertions.
- No production files are changed.

## Rollback considerations

Revert this task commit only. It must not be coupled to implementation changes.

---

## task-02-batch-types-and-identity.md

# Task 02 - Batch Types And Stable Identity

Recommended model: GPT-5.4 for schema design and compatibility review; GPT-5.4-mini for TypeScript refactors once the schema is chosen.

Commit after implementation: `feat(image-batch): add stable multi-variant asset identity`

## Objective

Generalize image batch types from English/full scene-only items to deterministic asset identities that support language, variant, asset role, operation, and dependency hashes.

## Background

`image-batch.types.ts` and `image-batch.schemas.ts` currently use `language: "en"` and `format: "full"` literals. `custom_id` includes episode, `en`, `full`, scene ID, and hashes, but not asset role or dependency version.

## Scope

- Add a stable image asset identity type.
- Support roles: full scene, short scene, character reference, location reference, object/prop reference, reusable continuity asset, and thumbnail only if already in the image pipeline.
- Include operation: image generation, image edit, or deterministic transform.
- Include language, variant, scene/shot ID where applicable, model, size, quality, prompt hash, and reference dependency hashes.
- Keep old manifests readable through normalization where feasible.

## Out of scope

- No CLI commands.
- No provider submission changes beyond type compatibility.
- No short strategy behavior changes.

## Dependencies

Task 01.

## Repository evidence

- `packages/image-generation/src/image-batch.types.ts`
- `packages/image-generation/src/image-batch.schemas.ts`
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/shared/src/episode-filesystem.ts`

## Required changes

- Replace literal-only language/format fields with normalized language and variant fields.
- Add `assetRole`, `operation`, `identityHash`, and `dependencyHashes`.
- Update `buildCustomId` to derive from canonical identity fields, not array position.
- Ensure deterministic ordering by identity.

## Data model or manifest changes

Introduce manifest schema version `image-batch-v2` or a compatible versioned normalizer. Preserve reading of `image-batch-v1` for existing batches.

## CLI behavior

No CLI behavior changes yet.

## Error handling and observability

Add validation errors for missing identity fields, duplicate `custom_id`, duplicate destination paths, and unsupported operation/endpoint pairs.

## Security and cost controls

Identity must prevent duplicate paid requests by detecting equivalent prepared items before submission.

## Tests

- Stable identity for full scene, localized full scene, short scene, and reference asset.
- Deterministic custom IDs across repeated preparation.
- Duplicate identity and duplicate destination path rejection.
- Backward-compatible parsing for v1 manifests.

## Verification commands

```bash
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
```

## Acceptance criteria

- Batch identity no longer depends on English/full literals.
- Existing v1 tests either pass unchanged or are intentionally updated.
- Every request item has a stable identity and destination path.

## Rollback considerations

Keep v1 normalization isolated so rollback can restore the previous schema without modifying episode assets.

---

## task-03-reference-asset-stages.md

# Task 03 - Reference Asset Stages

Recommended model: GPT-5.4 for endpoint and dependency modeling; GPT-5.4-mini for focused implementation once request shapes are pinned.

Commit after implementation: `feat(image-batch): stage reference assets before scenes`

## Objective

Model reference images as first-class staged batch assets and ensure dependent scene requests cannot be prepared before required references exist or are explicitly allowed.

## Background

Synchronous scene generation loads approved character references and uses image edit semantics when references are present. The batch planner currently tracks reference hashes but emits text-only generation requests.

## Scope

- Add reference asset planning for character references.
- Add extension points for location, object/prop, and reusable continuity assets.
- Add staged dependency ordering: reference prompts, reference images, scene prompts, scene images.
- Enforce approval or explicit unapproved-reference allowance before dependent scenes.
- Validate endpoint choice for text-only generation versus reference-assisted edit.

## Out of scope

- No legacy reference workflow revival.
- No location/object generation unless existing source data can support it.
- No thumbnails unless already connected to the current image-generation pipeline.

## Dependencies

Task 02.

## Repository evidence

- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/thumbnail-image-generator.ts`
- `packages/image-generation/src/thumbnail-reference-resolver.ts`

## Required changes

- Add a reference-stage planner that reuses existing character registry and prompt generation.
- Add dependency hashes to scene items from referenced assets.
- Prepare a reference-assisted scene batch only when every referenced asset has a pre-uploaded OpenAI file ID.
- Serialize `/v1/images/edits` JSONL with reference image file IDs in `body.image`; refuse local-file-only references before submission.

## Data model or manifest changes

Add dependency entries per item: asset identity, source path, SHA-256, approval status, and dependency role.

## CLI behavior

No public CLI yet, but planner APIs must expose reference stages for Task 05.

## Error handling and observability

Emit structured errors for missing reference image, unapproved reference, missing OpenAI reference file ID, and stale dependency hash.

## Security and cost controls

Do not submit dependent scene requests when reference stages are incomplete. Include request count previews per stage.

## Tests

- Character reference stage precedes dependent scene stage.
- Scene preparation fails if a required approved reference is missing.
- Reference-assisted scenes with uploaded file IDs use `/v1/images/edits`.
- Reference-assisted scenes without uploaded file IDs never silently fall back to text-only generation.
- Text-only scenes still use `/v1/images/generations`.

## Verification commands

```bash
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/image-generation/src/episode-image-pipeline.unit.test.ts
```

## Acceptance criteria

- Reference assets are represented in batch planning.
- Dependent scenes include reference dependency hashes.
- Reference-assisted batch requests preserve image inputs through uploaded OpenAI file IDs or fail before submission.

## Rollback considerations

Keep staged planning additive. Rollback should leave synchronous reference generation intact.

## Final response required from Codex

Return:
- changed files grouped by purpose;
- tests/verification commands run and their status;
- any command failures with exact root cause;
- remaining risks;
- suggested commit message(s), preserving the task commit messages where separate commits are required.