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
