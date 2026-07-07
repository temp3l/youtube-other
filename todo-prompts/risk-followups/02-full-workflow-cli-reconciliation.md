# Full workflow: preparation, CLI lifecycle, reconciliation/resume

Recommended model: GPT-5.4 for this whole batch. Use GPT-5.4-mini only for isolated CLI wiring once planner/service behavior is already green.

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

## task-04-full-scene-batch-workflow.md

# Task 04 - Full Scene Batch Workflow

Recommended model: GPT-5.4 for orchestration and manifest correctness; GPT-5.4-mini for adapting existing planner/service tests.

Commit after implementation: `feat(image-batch): prepare full scene image batches`

## Objective

Complete batch preparation for full-video scene images for a selected language using canonical scene manifests, prompts, references, and output paths.

## Background

`prepareImageBatchForEpisode` currently requires existing per-scene manifests and only models English/full scenes. Full localized video workflows reuse canonical images today, so batch preparation must reject multi-language full runs until locale-specific output paths exist for separate localized images.

## Scope

- Prepare full scene batch items for a selected episode, one language per run, and full variant.
- Reuse valid existing assets when hashes match.
- Preserve scene-to-image associations through stable identity.
- Split oversized jobs deterministically when request limits are configured.
- Keep canonical output path resolution centralized.

## Out of scope

- Short image batching.
- CLI lifecycle commands.
- Provider submission changes beyond prepared manifests.

## Dependencies

Tasks 02 and 03.

## Repository evidence

- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/shared/src/episode-filesystem.ts`
- `apps/cli/src/index.ts`
- `apps/cli/src/episode-commands.ts`

## Required changes

- Extend planner inputs to include selected languages and variants.
- Load localized story/scene context through canonical resolvers.
- Prepare prompt files before JSONL generation when missing.
- Group batch items by endpoint and compatible request model.
- Write deterministic manifests and JSONL files.

## Data model or manifest changes

Each item must store episode ID, language, variant `full`, scene ID, asset role, operation, prompt hash, provider request hash, reference dependency hashes, and canonical output path.

## CLI behavior

No final CLI commands yet, but expose a service function that Task 05 can call for `images batch prepare`.

## Error handling and observability

Report missing scene plan, missing prompt, missing reference dependency, duplicate custom ID, duplicate output path, unsupported endpoint, and multi-language shared-output conflicts.

## Security and cost controls

Prepare-only must not call OpenAI. Output a request count and model/size/quality summary.

## Tests

- Prepare all full scene requests for one language.
- Prepare a selected language without hard-coding `en`.
- Reject multi-language full preparation while canonical outputs remain shared.
- Skip valid existing outputs.
- Split request groups deterministically.
- Refuse duplicate destination paths.

## Verification commands

```bash
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
```

## Acceptance criteria

- Full scene batch preparation is deterministic and language-aware.
- Prepared request lines use the correct endpoint for each operation.
- No provider calls happen during preparation.

## Rollback considerations

Keep synchronous `images generate` unaffected. Prepared batch artifacts can be deleted without touching generated scene images.

---

## task-05-batch-lifecycle-cli.md

# Task 05 - Batch Lifecycle CLI

Recommended model: GPT-5.4-mini for CLI wiring; GPT-5.4 for reviewing lifecycle semantics and operator safety.

Commit after implementation: `feat(cli): expose image batch lifecycle commands`

## Objective

Expose image batch preparation, submission, status, download, and resume through a clear CLI workflow.

## Background

`submitImageBatch`, `refreshImageBatch`, `importImageBatch`, and `retryFailedImageBatch` exist but are not registered under the `images` CLI command group.

## Scope

- Add `images batch prepare`.
- Add `images batch submit`.
- Add `images batch status`.
- Add `images batch download`.
- Add `images batch resume`.
- Print machine-readable JSON with `--json`.
- Reuse existing runtime config and workspace resolution conventions.

## Out of scope

- No new paid behavior without explicit submit command.
- No broad episode orchestration rewrite.
- No legacy workbook command changes.

## Dependencies

Tasks 02-04.

## Repository evidence

- `apps/cli/src/index.ts`
- `apps/cli/src/images-resume-command.ts`
- `apps/cli/src/story-localization-commands.ts`
- `packages/image-generation/src/image-batch-service.ts`

## Required changes

- Create a focused CLI module for `images batch`.
- Wire command registration from `apps/cli/src/index.ts`.
- Require explicit `submit` before network calls.
- Resolve batch references by local or OpenAI batch ID.

## Data model or manifest changes

None beyond previous tasks.

## CLI behavior

Proposed commands:

```bash
pnpm mediaforge -- images batch prepare --episode <episode> --languages en,de --variants full,short
pnpm mediaforge -- images batch submit --episode <episode> --batch <local-id>
pnpm mediaforge -- images batch status --episode <episode> --batch <local-id>
pnpm mediaforge -- images batch download --episode <episode> --batch <local-id>
pnpm mediaforge -- images batch resume --episode <episode>
```

Use repository naming conventions if command registration requires slight adjustment.

## Error handling and observability

CLI output must include episode, language, variant, local batch ID, OpenAI batch ID when present, endpoint, item counts, retryable failures, and cost-relevant request settings. Do not print secrets or signed URLs.

## Security and cost controls

Only `submit` may upload files or create remote batches. `prepare` must be local-only and print a request summary.

## Tests

- Command registration.
- Prepare command calls planner without provider client.
- Submit command calls upload/create only for prepared manifests.
- Status/download/resume command routing with fake clients.

## Verification commands

```bash
pnpm test:focused -- apps/cli/src/index.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
```

## Acceptance criteria

- Operators can run image batch lifecycle commands from CLI.
- No command submits paid work except `submit`.
- JSON output is stable enough for automation.

## Rollback considerations

Commands are additive. Rollback by removing the registration module and tests.

---

## task-06-reconciliation-validation-resume.md

# Task 06 - Reconciliation, Validation, And Resume

Recommended model: GPT-5.4 for failure semantics and idempotency; GPT-5.4-mini for test expansion and small refactors.

Commit after implementation: `fix(image-batch): harden reconciliation and resume`

## Objective

Make imported image batch results safe, idempotent, and resumable after partial failures.

## Background

`importImageBatch` already reconciles by `custom_id`, decodes base64 payloads, validates MIME/dimensions, writes files atomically, and marks missing outputs retryable. This must be expanded to the generalized identity and CLI workflow.

## Scope

- Reconcile output and error lines only by stable identity.
- Detect unknown and duplicate `custom_id` lines.
- Support partial success and retry only failed/missing/invalid assets.
- Validate MIME type, dimensions, file integrity, destination path, and dependency hashes.
- Preserve successful result mappings across retries.
- Avoid treating interrupted downloads or partial files as complete.

## Out of scope

- No provider submission changes.
- No new short strategy policy.

## Dependencies

Tasks 02-05.

## Repository evidence

- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/image-batch-storage.ts`
- `packages/shared/src/index.ts`
- `packages/rendering/src/index.ts`

## Required changes

- Extend import validation to generalized asset roles.
- Store result state per item with retry count and error details.
- Refuse manifest/filesystem disagreement unless resume can repair safely.
- Make retry preparation preserve root/parent batch lineage.

## Data model or manifest changes

Add per-item result details: output hash, width, height, MIME type, byte size, output file ID, error category/code/message, retry count, and imported timestamp.

## CLI behavior

`images batch download` must import completed batches and return `imported`, `imported_with_failures`, or a clear non-terminal status. `images batch resume` must prepare a new batch only for retryable items.

## Error handling and observability

Classify failures as API failure, policy rejection, expired batch, decode failure, validation failure, missing result, unknown result, duplicate result, stale dependency, or destination conflict.

## Security and cost controls

Resume must not resubmit successful items. It must print exactly how many retryable paid requests will be prepared.

## Tests

- Out-of-order output reconciliation.
- Duplicate and unknown custom IDs.
- Error file processing.
- Invalid base64 and invalid image dimensions.
- Partial success followed by retry batch for failures only.
- Existing valid asset skip on resume.

## Verification commands

```bash
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
```

## Acceptance criteria

- Import is order-independent and idempotent.
- Partial failures never overwrite successful assets.
- Resume creates no duplicate successful paid requests.

## Rollback considerations

Keep schema normalization for earlier manifests. Rollback should not delete generated images or batch result files.

## Final response required from Codex

Return:
- changed files grouped by purpose;
- tests/verification commands run and their status;
- any command failures with exact root cause;
- remaining risks;
- suggested commit message(s), preserving the task commit messages where separate commits are required.