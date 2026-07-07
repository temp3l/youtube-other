# Final hardening: multilingual aliases, short downstream verification, remaining risks

Recommended model: GPT-5.4 for the full batch because it crosses planner, manifests, import/resume, renderer, and docs. Use GPT-5.4-mini only for final docs polish after tests pass.

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

## task-11-multilingual-full-scene-shared-output.md

# Task 11 - Multilingual Full-Scene Shared Output

Recommended model: GPT-5.4 for planner and manifest policy work; GPT-5.4-mini for targeted test iteration.

Commit after implementation: `fix(image-batch): enforce multilingual full-image output policy`

## Objective

Resolve the remaining full-scene multilingual output ambiguity by introducing an
explicit shared-output policy that allows safe aliases and rejects conflicting
same-path writes.

## Background

Full-scene outputs currently target shared canonical paths under
`shared/images/generated/`. The planner currently rejects multiple languages in
one run because those paths collide, even when two languages are effectively
requesting the same image. The remaining gap is not path normalization; it is
how to represent safe sharing without duplicate paid requests or ambiguous
imports.

## Scope

- Define and implement the full-scene shared-output policy.
- Detect duplicate destination paths across languages.
- Allow same-path duplicates only when they are provably safe shared-output
  aliases.
- Represent alias relationships in the manifest.
- Ensure import, retry, and renderer resolution all behave correctly for owner
  and alias items.

## Out of scope

- No fallback to legacy localized full-image layouts.
- No broad renderer redesign outside alias-aware path consumption.

## Dependencies

Task 10.

## Repository evidence

- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/image-batch.schemas.ts`
- `packages/image-generation/src/image-batch.types.ts`
- `packages/rendering/src/index.ts`
- `packages/image-generation/src/image-batch-planner.unit.test.ts`
- `packages/image-generation/src/image-batch-service.unit.test.ts`

## Required changes

- Add a shared-output decision point such as `sharedOutputPolicy`.
- Compare multilingual same-path candidates using at least:
  - `providerRequestHash`
  - `generationConfigurationHash`
  - operation
  - output format
  - dependency hashes
- If candidates are identical, pick one deterministic owner item and mark the
  others as aliases.
- Emit provider JSONL only for owner items.
- If candidates differ, reject preparation before any write or submission.
- Update import so owner results populate alias items consistently.
- Update retry logic so alias items do not create duplicate paid requests.
- Keep canonical full-scene paths shared when aliasing is safe.

## Data model or manifest changes

- Extend manifest items with explicit alias metadata, such as:
  - whether the item owns the shared output
  - which `customId` it aliases, if any
  - a stable shared-output key
- Schema-validate any new manifest fields.

## CLI behavior

- `images batch prepare --variants full --languages en,de` may succeed only when
  same-path collisions are proven safe aliases.
- Unsafe same-path collisions must fail during preparation with a clear error.

## Error handling and observability

- Report duplicate destination rejection with enough detail to show the
  colliding languages and identities.
- Surface alias counts in prepare/download summaries if that fits the existing
  JSON shape without breaking current consumers.

## Security and cost controls

- Safe aliasing must reduce paid duplication rather than increase it.
- Retries must never resubmit alias followers independently.

## Tests

- English and German safely share a full-scene image when request identity is
  identical.
- English and German require distinct outputs when prompts or dependencies differ.
- Accidental same-path duplicates are rejected.
- Alias-aware import updates all linked items consistently.
- Alias-aware retry submits only owner items.
- Renderer lookup succeeds when a shared full-scene path is owned by one item and
  referenced by aliases.

## Verification commands

```bash
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm test:focused -- packages/rendering/src/index.unit.test.ts
```

## Acceptance criteria

- Multilingual full-scene output policy is explicit in code and manifests.
- Safe shared outputs avoid duplicate provider requests.
- Unsafe path collisions fail before submission.
- Import, retry, and rendering handle aliases consistently.

## Rollback considerations

- Alias metadata must be local to the batch manifest and planner logic so it can
  be reverted without deleting canonical shared assets.

---

## task-12-short-batch-downstream-verification.md

# Task 12 - Short Batch Downstream Verification

Recommended model: GPT-5.4-mini for focused batch-flow tests; GPT-5.4 for cross-package consistency review.

Commit after implementation: `fix(image-batch): verify short batch import and resume`

## Objective

Verify that short-image batch support is correct across CLI prepare output,
provider submission boundaries, import/download, resume, manifest updates, and
renderer consumption.

## Background

Short-scene batch preparation already splits work into native generation,
deterministic transforms, reuse, and blocked items. The remaining risk is not
the strategy selection itself; it is whether downstream batch flows only submit
native items, keep transform-only work local, and preserve canonical short
render inputs after import and resume.

## Scope

- Verify CLI routing for `--variants short`.
- Verify prepare JSON/summary output for paid versus local work.
- Verify import/download behavior for native short items.
- Verify transform-only items never enter provider submission or provider-result
  decoding.
- Verify resume only retries failed native short generation items.
- Verify renderer compatibility with the resulting short manifest and portrait
  paths.
- Run narrow TypeScript checks for affected packages.

## Out of scope

- No new short generation strategy design.
- No broad repo typecheck or build unless required by package boundaries.

## Dependencies

Task 11.

## Repository evidence

- `apps/cli/src/images-batch-commands.ts`
- `apps/cli/src/images-batch-commands.unit.test.ts`
- `packages/image-generation/src/shorts-image-strategy.ts`
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/image-batch-service.ts`
- `packages/rendering/src/index.ts`

## Required changes

- Confirm `images batch prepare --variants short` routes through the short
  planner.
- Keep prepare summaries explicit about:
  - paid native generations
  - free deterministic transforms
  - cache reuse
  - blocked items
- Ensure transform-only items are stored only in the short local work plan and
  never become provider requests.
- Ensure native short imports write canonical portrait outputs and update the
  short manifest.
- Ensure download/import does not try to decode transform-only items as provider
  outputs.
- Ensure resume only retries failed native items and ignores local-only
  transform/reuse entries.
- Confirm existing valid portrait assets are reused.
- Confirm missing landscape dependencies fail before submission.

## Data model or manifest changes

- Preserve current manifest shape unless an explicit discriminator is needed to
  distinguish provider-owned short items from local-only short work.
- Keep CLI JSON output stable unless the task intentionally adds fields already
  required by the short workflow.

## CLI behavior

- `images batch prepare --variants short --json` must expose short-specific
  preview counts and the local work-plan path.
- `images batch download` and `images batch resume` must continue to work with
  short native generation batches without treating local-only items as remote
  results.

## Error handling and observability

- Report missing landscape input, stale short source hashes, invalid portrait
  dimensions, and unsupported short endpoint errors clearly.
- If TypeScript checks fail because of unrelated local state, record the exact
  unrelated files rather than modifying them.

## Security and cost controls

- Keep local deterministic transforms free and local.
- Resume must avoid duplicate paid requests for items already satisfied by reuse
  or local transforms.

## Tests

- CLI prepare routes `short` through the short planner.
- Prepare summary separates paid native generation from local deterministic
  transforms.
- Transform-only items never enter provider JSONL.
- Import writes native short results to canonical portrait paths.
- Download/import ignores transform-only items as provider results.
- Resume retries only failed native short generation items.
- Existing valid short portraits are reused.
- Missing full landscape source fails before submission.
- Renderer consumes the resulting short manifest and portrait paths.

## Verification commands

```bash
pnpm test:focused -- apps/cli/src/index.unit.test.ts
pnpm test:focused -- apps/cli/src/images-batch-commands.unit.test.ts
pnpm test:focused -- packages/image-generation/src/shorts-image-strategy.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm test:focused -- packages/rendering/src/index.unit.test.ts
pnpm --filter @mediaforge/shared --filter @mediaforge/image-generation --filter @mediaforge/rendering --filter @mediaforge/cli typecheck
```

## Acceptance criteria

- Short prepare/import/download/resume behavior is verified across CLI and
  library layers.
- Local-only short work never becomes a provider request.
- Renderer-facing short outputs remain canonical and stable.
- Narrow package TypeScript checks pass or are documented as blocked by unrelated
  local state.

## Rollback considerations

- Keep short verification changes scoped to tests, summaries, and retry/import
  guards so rollback does not disturb the underlying short strategy implementation.

---

## task-13-remaining-risks-triage-and-docs.md

# Task 13 - Remaining Risks Triage And Docs

Recommended model: GPT-5.4-mini for final documentation edits; GPT-5.4 for release-note style audit consistency review.

Commit after implementation: `docs(image-batch): record remaining risk triage`

## Objective

Record the final state of the remaining batch-image risks, including provider
verification status, multilingual shared-output behavior, short-batch downstream
status, and the handling of unrelated stale artifacts in the workspace.

## Background

The original operator docs describe the implemented batch workflow, but they do
not yet capture the remaining-risk triage pass, the real status of reference
edit batch semantics, or the distinction between unrelated workspace artifacts
and actual in-scope implementation gaps.

## Scope

- Update `docs/cli-batch-images.md`.
- Update `docs/plans/cli-batch-images/batch-image-audit.md`.
- Finalize `docs/plans/cli-batch-images/remaining-risks-triage.md`.
- Cross-link the provider manual verification checklist.
- Document stale diagram render and stale CLI runtime handling as unrelated
  workspace concerns.

## Out of scope

- No new product behavior unless documentation review exposes a small mismatch
  that must be fixed in already-touched batch-image code.
- No artifact cleanup by default.

## Dependencies

Tasks 10-12.

## Repository evidence

- `docs/cli-batch-images.md`
- `docs/plans/cli-batch-images/batch-image-audit.md`
- `docs/plans/cli-batch-images/remaining-risks-triage.md`
- `docs/plans/cli-batch-images/provider-reference-semantics-checklist.md`
- `apps/cli/bin/mediaforge.js`
- `docs/diagrams/rendered/*`

## Required changes

- Document current provider verification status for image-edit batch semantics.
- State clearly whether reference-assisted batch edits are implemented, blocked,
  or manual-only.
- Document the final multilingual full-scene shared-output policy.
- Document alias behavior if implemented.
- Document short-batch support status across prepare, submit, download/import,
  resume, and rendering.
- Record known limitations and safe verification commands.
- Record which stale artifacts are unrelated and how to handle them safely.
- Record any remaining risks left after Tasks 10-12.

## Data model or manifest changes

No new schema changes required. If manifest alias fields or provider-safeguard
fields were added earlier, document them with sanitized examples.

## CLI behavior

- Do not document any verification command as implemented unless it exists in
  source.
- Keep command examples aligned with the actual merged `images batch` CLI.

## Error handling and observability

- Document current planner/import errors relevant to remaining risks.
- Document when operators should stop and use the manual checklist instead of
  attempting a paid provider verification.

## Security and cost controls

- Reiterate that prepare and resume are local-only.
- Reiterate that any manual provider verification must be explicit, dry-run
  gated, and secret-safe.

## Tests

- Markdown formatting check.
- Focused docs-related CLI tests if command/help text changes.
- Diagram freshness check only as a reporting tool; do not clean stale diagram
  artifacts unless the task is explicitly expanded.

## Verification commands

```bash
pnpm test:focused -- apps/cli/src/index.unit.test.ts
pnpm exec prettier --check docs/cli-batch-images.md docs/plans/cli-batch-images
pnpm docs:diagrams:check
```

## Acceptance criteria

- The docs distinguish unrelated workspace noise from real implementation gaps.
- Operators can tell exactly what is verified, blocked, manual-only, and still
  risky.
- Cleanup guidance is explicit and non-destructive.

## Rollback considerations

- These doc updates can be reverted independently.
- Do not roll back artifact notes in a way that suggests stale tracked outputs
  were cleaned or rebuilt when they were not.

## Final response required from Codex

Return:
- changed files grouped by purpose;
- tests/verification commands run and their status;
- any command failures with exact root cause;
- remaining risks;
- suggested commit message(s), preserving the task commit messages where separate commits are required.