# Common Codex Execution Rules

Apply these rules to every batch:

- Work in implementation mode, not broad research mode.
- Reuse existing services and CLI entry points. Do not create a second disconnected pipeline.
- Keep each task in a separate logical commit-ready change set, even if you do not create commits.
- Do not call paid providers, upload files, run real OpenAI batches, run remote renders, run YouTube uploads, regenerate fixtures, or update snapshots unless explicitly requested.
- Prefer focused tests only: `pnpm test:focused -- <exact-test-file>`.
- After focused tests pass, run at most one affected-package typecheck if the code changes justify it.
- Do not run broad repo-wide build/test/typecheck commands.
- Preserve existing low-level commands until the new wrappers are stable.
- Add or update tests before/with behavior changes.
- Keep state ownership explicit: existing per-episode workflow manifests remain the source of truth; new production summaries and run folders are audit/reporting layers.
- End with an implementation report under `docs/reports/codex-runs/2026-07-09-<batch-name>-implementation-report.md`.
- The report must include: source task files, summary, changed files, tests/checks run, results, incomplete items, deviations, risks, and next recommended batch.
- Stop and report instead of weakening tests or broadening scope if a stop condition is hit.


# Codex Prompt — Batch A: Run State And ID Foundation

## Model

Use **GPT-5.5 High reasoning**.

## Source task

- `task-01-batch-run-and-state-foundation.md`

## Objective

Implement the shared run/state foundation for resilient batch orchestration. This batch defines the contracts later text, image, audio, and render wrappers will consume. Keep it additive and test-covered.

## Scope

Implement only Task 01:

- run-level schema and storage helpers for `batches/<run-id>/batch-plan.json`
- compact per-episode production state summary shape
- orchestration status mapping helpers
- readable `custom_id` parsing/validation helpers
- duplicate `custom_id` rejection
- compatibility with existing deterministic text/image batch IDs

## Existing functionality to reuse

Inspect and reuse:

- `packages/story-localization/src/story-workflow.types.ts`
- `packages/story-localization/src/story-workflow-store.ts`
- `packages/story-localization/src/story-workflow-status.ts`
- `packages/story-localization/src/story-workflow-batch.ts`
- `packages/story-localization/src/story-localization.schemas.ts`
- `packages/image-generation/src/image-batch.types.ts`
- `packages/shared/src/episode-filesystem.ts`

## Required design constraints

- Existing per-episode workflow manifests remain the source of truth.
- New production summaries are compact operator-facing summaries, not a competing state owner.
- New run state is persisted under `batches/<run-id>/`.
- `custom_id` parsing must reject malformed, unsupported, duplicated, or extra-segment IDs.
- Language support must be explicit: `en`, `de`, `es`, `fr`, `pt`.
- Profile support must be explicit: `full`, `short`.
- Stage support must be explicit and match approved orchestrator stages only.
- Retry IDs may append `:retry-rN` and must preserve a link to the original ID.
- Do not implement text import, image import, gates, audio wrappers, or render wrappers in this batch.

## Implementation steps

1. Inspect current workflow/batch state models and tests.
2. Add additive schema/types for run-level state and production summary.
3. Add orchestration status mapping helpers from existing workflow/text/image states.
4. Add `custom_id` parse/build/validate helpers.
5. Add duplicate ID detection for batch-plan items.
6. Add focused unit tests.

## Tests to add/update

Add or update tests covering:

- run-state schema validation
- production summary schema validation
- status mapping coverage
- valid `custom_id` examples
- invalid stage/language/profile rejection
- extra segment rejection
- retry suffix parsing
- duplicate `custom_id` rejection

## Verification

Run only:

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow-batch.unit.test.ts
```

If you create a different directly adjacent test file, run that exact file too. After focused tests pass, run one affected package typecheck only if necessary.

## Commit gate

Do not proceed past this batch unless state shapes are additive, test-covered, and clearly compatible with existing workflow manifests.

## Required report

Create or update:

```text
docs/reports/codex-runs/2026-07-09-batch-a-state-foundation-implementation-report.md
```

Include changed files, tests run, results, incomplete items, and the recommended next batch.
