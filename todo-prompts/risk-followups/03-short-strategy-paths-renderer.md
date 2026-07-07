# Short strategy plus canonical paths and renderer integration

Recommended model: GPT-5.4 for strategy/path integration review; GPT-5.4-mini for focused resolver/test iteration.

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

## task-07-short-image-strategy.md

# Task 07 - Short Image Batch Strategy

Recommended model: GPT-5.4 for visual strategy and cost tradeoffs; GPT-5.4-mini for implementation once policies are explicit.

Commit after implementation: `feat(image-batch): support short image batch strategy`

## Objective

Integrate short-video image requirements with the batch workflow while preserving deterministic transforms where they are sufficient.

## Background

`prepareShortsImageAssets` currently selects key scenes for native portrait regeneration and transforms the rest from landscape full images. This behavior should remain the default unless a scene genuinely requires separate generation.

## Scope

- Classify each short image as native generation, reuse full image, or deterministic conversion.
- Batch only native short generation items.
- Preserve `smart-crop`, `pan-and-scan`, and `blurred-fill` transforms for deterministic outputs.
- Store transform metadata and generated item identities in `shorts-image-manifest.json` or a compatible batch-linked manifest.
- Support requested languages and short variants.

## Out of scope

- No forced regeneration of all short images.
- No separate short generation when deterministic conversion is adequate.
- No renderer rewrite beyond manifest/path integration.

## Dependencies

Task 02. For merge, Tasks 03 and 04 should be complete.

## Repository evidence

- `packages/image-generation/src/shorts-image-strategy.ts`
- `apps/cli/src/episode-commands.ts`
- `packages/rendering/src/index.ts`
- `apps/cli/src/shots.ts`

## Required changes

- Add short image planning output compatible with image batch identity.
- Use existing `ShortsImageConfig` defaults for key scene selection.
- Represent deterministic transforms as non-provider batch items or linked local tasks.
- Prepare provider batch requests for native short scenes only.

## Data model or manifest changes

Short image items must record source full image hash, transform strategy, output portrait path, prompt hash for native generation, and parent narration/full-image dependencies.

## CLI behavior

`images batch prepare --variants short` must preview how many short images will be generated versus transformed locally.

## Error handling and observability

Report missing landscape source, duplicate portrait destination, invalid portrait dimensions, stale source hash, and unsupported native generation endpoint.

## Security and cost controls

Print separate counts for paid native generations and free deterministic transforms. Never submit transform-only items to OpenAI.

## Tests

- Classification table for short scenes.
- Native short generation request preparation for key scenes.
- Deterministic transform items are not submitted as provider requests.
- Existing portrait cache reuse.
- Missing landscape image failure.

## Verification commands

```bash
pnpm test:focused -- packages/image-generation/src/shorts-image-strategy.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
```

## Acceptance criteria

- Short batch workflow supports native generation where required.
- Deterministic conversion remains preferred for safe reuse cases.
- Renderable portrait outputs are placed in canonical short paths.

## Rollback considerations

Keep current `episode short` synchronous/transform flow available while batch support is added.

---

## task-08-paths-renderer-integration.md

# Task 08 - Paths And Renderer Integration

Recommended model: GPT-5.4-mini for path/resolver implementation; GPT-5.4 for integration review across manifests and renderers.

Commit after implementation: `fix(image-batch): normalize asset paths for rendering`

## Objective

Ensure batch-generated and transformed assets are placed in canonical episode paths and consumed correctly by full and short renderers.

## Background

Full rendering consumes shared generated images. Short rendering consumes `shared/short/images/generated` and `shorts-image-manifest.json`. Batch service currently writes to `expectedOutputPath` from scene manifests and derives scene manifest paths from output paths.

## Scope

- Centralize canonical paths for full scene images, short scene images, reference images, batch inputs/results/errors/reports, and manifests.
- Ensure import writes batch outputs only to canonical paths.
- Ensure renderer lookup resolves batch-generated full and short assets.
- Mark deprecated path layouts in docs and avoid using them in new code.

## Out of scope

- No broad filesystem migration.
- No generated episode asset mutation outside tests.

## Dependencies

Tasks 04, 06, and 07.

## Repository evidence

- `packages/shared/src/episode-filesystem.ts`
- `packages/rendering/src/index.ts`
- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/shorts-image-strategy.ts`

## Required changes

- Add or reuse resolver helpers for all batch image asset categories.
- Update batch planner/importer to use resolvers instead of ad hoc path derivation where needed.
- Verify renderer image lookup prefers canonical filenames and fails clearly on ambiguity.

## Data model or manifest changes

Manifest item paths must be resolver-derived and include a repo/workspace-relative display path where useful for logs.

## CLI behavior

CLI status should report canonical image directories and manifest paths.

## Error handling and observability

Report duplicate destination paths, missing renderer asset, ambiguous renderer matches, and stale manifest/output disagreements.

## Security and cost controls

Path normalization must prevent traversal outside the episode workspace.

## Tests

- Full batch output path resolves to renderer-consumable image.
- Short batch/transform output path resolves to renderer-consumable portrait image.
- Reference paths stay under shared reference directories.
- Ambiguous image matches fail deterministically.

## Verification commands

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- packages/rendering/src/index.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
```

## Acceptance criteria

- Batch import and renderer consumption agree on canonical paths.
- Deprecated layouts are not used for new batch artifacts.
- Path traversal and ambiguity are rejected.

## Rollback considerations

Keep path changes behind resolver helpers so rollback is local and does not require deleting assets.

## Final response required from Codex

Return:
- changed files grouped by purpose;
- tests/verification commands run and their status;
- any command failures with exact root cause;
- remaining risks;
- suggested commit message(s), preserving the task commit messages where separate commits are required.