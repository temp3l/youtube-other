# Operator docs, smoke verification, provider safeguards

Recommended model: GPT-5.4 for provider contract/safety review; GPT-5.4-mini for docs formatting and small test hardening.

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

## task-09-operator-docs-and-smoke-verification.md

# Task 09 - Operator Docs And Smoke Verification

Recommended model: GPT-5.4-mini for documentation and command examples; GPT-5.4 for final audit consistency review.

Commit after implementation: `docs(image-batch): document CLI batch image workflow`

## Objective

Create final operator/developer documentation and run safe smoke verification for the completed image batch workflow.

## Background

Existing docs cover story-localization batches and endpoint usage, but they do not accurately document the current image batch CLI gap, reference-input limitations, or short image strategy.

## Scope

- Create or update `docs/cli-batch-images.md`.
- Update `docs/plans/cli-batch-images/batch-image-audit.md` with final implementation status.
- Include actual commands, proposed/legacy distinctions, lifecycle states, JSONL examples, manifest examples, output paths, resume/retry behavior, failure recovery, observability, and known limitations.
- Include a Mermaid flowchart.
- Verify referenced paths and commands.

## Out of scope

- No production code changes unless a docs verification issue exposes a typo in command registration already implemented by prior tasks.
- No real provider calls.

## Dependencies

Tasks 01-08.

## Repository evidence

- `docs/batch-cli.md`
- `docs/openai-api-endpoint-audit.md`
- `docs/development/commands.md`
- `apps/cli/src/index.ts`
- `packages/image-generation/src/image-batch-service.ts`

## Required changes

- Document actual implemented image batch commands.
- Clearly label any remaining proposed interfaces as not implemented.
- Document full-versus-short image strategy as implemented.
- Document reference-image handling and staged-batch requirements.

## Data model or manifest changes

No schema changes. Include sanitized examples from the implemented manifest and request formats.

## CLI behavior

Document:

```bash
pnpm mediaforge -- images batch prepare --episode <episode> --languages en --variants full
pnpm mediaforge -- images batch submit --episode <episode> --batch <local-id>
pnpm mediaforge -- images batch status --episode <episode> --batch <local-id>
pnpm mediaforge -- images batch download --episode <episode> --batch <local-id>
pnpm mediaforge -- images batch resume --episode <episode>
```

Adjust examples to match the exact merged CLI.

## Error handling and observability

Document invalid JSONL, validation failure, expired batch, partial errors, missing files, unknown/duplicate custom IDs, invalid base64, unsupported endpoint, missing reference image, destination conflict, manifest/filesystem disagreement, and renderer resolution failure.

## Security and cost controls

Document prepare-only mode, request count preview, model/size/quality preview, confirmation behavior if implemented, duplicate-submission prevention, logging without secrets, and avoiding unnecessary short generation.

## Tests

- Markdown formatting check.
- Mermaid diagram check if tooling is available.
- Focused CLI registration tests.
- Focused image batch tests.

## Verification commands

```bash
pnpm test:focused -- apps/cli/src/index.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm docs:diagrams:check
pnpm exec prettier --check docs/cli-batch-images.md docs/plans/cli-batch-images
```

## Acceptance criteria

- Documentation matches implemented commands and behavior.
- Known limitations are explicit.
- Smoke verification is recorded in the final task commit.

## Rollback considerations

Docs-only rollback is safe. Do not roll back earlier implementation commits unless their behavior is also reverted.

---

## task-10-provider-reference-safeguards.md

# Task 10 - Provider Reference Safeguards

Recommended model: GPT-5.4-mini for test and docs hardening; GPT-5.4 for final contract review.

Commit after implementation: `test(image-batch): verify provider reference safeguards`

## Objective

Separate unrelated workspace noise from real batch-image work, then harden the
repository so reference-assisted image-edit batches are treated as unsupported
until their JSONL semantics are proven with a real provider check.

## Background

The current planner knows about `/v1/images/edits` and can serialize batch lines
with `image: ["file_ref_123"]`, but repository evidence only proves synchronous
multipart `client.images.edit(...)` calls with `Uploadable` inputs. The OpenAI
batch SDK types allow the endpoint, but they do not prove the JSONL request body
shape for image/file inputs.

## Scope

- Inspect the current worktree and classify every local change.
- Create `docs/plans/cli-batch-images/remaining-risks-triage.md`.
- Inspect installed OpenAI SDK batch and images typings.
- Update planner/tests/docs so unsupported reference-assisted batch semantics
  fail during preparation instead of being treated as proven provider support.
- Add a manual verification checklist document for future opt-in provider checks.

## Out of scope

- No real batch submission by default.
- No provider file upload by default.
- No paid asset generation.
- No cleanup of unrelated tracked or untracked artifacts.

## Dependencies

Tasks 01-09.

## Repository evidence

- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/openai-image.unit.test.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`
- `node_modules/openai/resources/batches.d.ts`
- `node_modules/openai/resources/images.d.ts`
- `docs/cli-batch-images.md`
- `docs/plans/cli-batch-images/batch-image-audit.md`

## Required changes

- Write `remaining-risks-triage.md` with:
  - branch and commit
  - changed files
  - per-file classification
  - safe-to-touch and must-not-touch lists
  - tracked/untracked status for stale diagram renders and CLI runtime artifacts
  - recommended cleanup commands only
- Verify and document that endpoint allow-list support alone is insufficient for
  image-edit JSONL safety.
- Make reference-assisted batch preparation fail before submission unless the
  implementation is explicitly proven safe in code and tests.
- Ensure text-only batch lines still target `/v1/images/generations`.
- Ensure reference-assisted scenes never silently downgrade to text-only
  generation when batch edit support is blocked.
- Create
  `docs/plans/cli-batch-images/provider-reference-semantics-checklist.md`
  instead of a live verification command unless a disabled-by-default command
  already fits the merged CLI style cleanly.

## Data model or manifest changes

- Keep manifest compatibility where possible.
- If the manifest or planner error details change, capture unsupported
  reference-batch state explicitly and schema-validate the change.

## CLI behavior

- `images batch prepare` must stay local-only.
- Reference-assisted batch items must fail during preparation with a clear
  unsupported-provider-semantics error until the JSONL shape is proven.

## Error handling and observability

- Report unsupported edit-batch semantics with enough detail to show:
  - endpoint
  - expected dependency inputs
  - why current repository evidence is insufficient
- Do not print secret values or raw credentials.

## Security and cost controls

- Any future manual verification flow must default to dry-run.
- Any network action must require an explicit allow flag.
- Any paid provider action must require a second explicit allow flag.
- Cost and request count must be shown before any paid action.

## Tests

- Text-only image generation batch request lines use
  `/v1/images/generations`.
- Reference-assisted scenes fail before submission and do not silently degrade to
  text-only generation.
- Provider calls remain mocked.
- Manual checklist docs match the actual current implementation status.

## Verification commands

```bash
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm exec prettier --check docs/plans/cli-batch-images/remaining-risks-triage.md docs/plans/cli-batch-images/provider-reference-semantics-checklist.md
```

## Acceptance criteria

- Worktree noise is classified without touching unrelated files.
- Reference-assisted batch image edits are documented as verified, blocked, or
  manual-only based on repository evidence.
- Unsupported semantics fail before provider submission.
- Operators have an explicit manual verification checklist.

## Rollback considerations

- Reverting this task must not re-enable silent reference-input dropping.
- Docs-only pieces can be rolled back independently from planner safeguards.

## Final response required from Codex

Return:
- changed files grouped by purpose;
- tests/verification commands run and their status;
- any command failures with exact root cause;
- remaining risks;
- suggested commit message(s), preserving the task commit messages where separate commits are required.