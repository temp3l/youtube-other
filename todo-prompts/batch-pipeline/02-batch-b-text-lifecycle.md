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


# Codex Prompt — Batch B: Text Batch Plan, Download, Import, Normalize, Validate

## Model

Use **GPT-5.5 High reasoning**.

Optional cost split:

- B1 wrappers only: GPT-5.5 Medium
- B2 import/normalize/validate/retry: GPT-5.5 High

## Source tasks

- `task-02-text-batch-plan-submit-download.md`
- `task-03-text-batch-import-normalize-validate.md`

## Objective

Implement the text batch lifecycle safely: plan, submit, status, download, import, normalize, validate, report, and seed retry plans. Keep provider output download separate from import and validation.

## Scope

Task 02:

- `stories batch plan`
- `stories batch submit`
- `stories batch status`
- `stories batch download`
- run-level audit folder creation
- write `batch-plan.json`, `input.jsonl`, `provider-batch.json`

Task 03:

- `stories batch import`
- `stories batch validate`
- `stories batch sync`
- write `import-report.json`
- write `validation-report.json`
- record item-level failures and retry candidates
- prevent approved artifact overwrite unless `--force`

## Existing functionality to reuse

Inspect and reuse:

- `apps/cli/src/story-localization-commands.ts`
- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/story-localization/src/story-localization-batch-storage.ts`
- `packages/story-localization/src/story-localization-openai-batch.ts`
- `packages/story-localization/src/story-localization-batch-index.ts`
- `packages/story-localization/src/story-localization.types.ts`
- `packages/story-localization/src/generated-story-validator.ts`
- `packages/story-localization/src/localized-content-text.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/story-workflow-store.ts`

## Required design constraints

- `stories batch download` must not import provider output.
- Provider output must never become a downstream input until it has been imported and validated.
- Import mapping must use `custom_id` only.
- Ignore provider output order.
- Import successful items even when siblings fail.
- Record provider failures per item.
- Normalize imported localized content before validation.
- Run deterministic validation after import.
- Persist validation failures per item.
- Skip overwriting approved artifacts unless `--force` is present.
- Imports must be idempotent on re-run.
- Retry candidates must exclude successful imported/validated items.
- Do not implement image batches, audio wrappers, render wrappers, or final production orchestration in this batch.

## Implementation steps

1. Inspect current text batch service/storage/CLI behavior.
2. Add plan-only CLI wrapper and run folder persistence.
3. Add submit/status/download wrappers over existing service behavior.
4. Add import wrapper using `custom_id` reconciliation only.
5. Add validation wrapper that validates imported artifacts, not raw provider output.
6. Add `sync` wrapper that refreshes/downloads/imports/validates/summarizes.
7. Add run-level `import-report.json` and `validation-report.json`.
8. Add retry candidate recording for provider failures and validation failures.
9. Add focused tests for order independence, partial import, idempotency, and overwrite protection.

## Tests to add/update

Cover:

- plan file generation
- input JSONL generation
- run ID creation
- CLI option validation
- provider metadata persistence
- download path persistence
- output order independence
- mixed success/failure partial import
- idempotent re-import
- approved artifact overwrite protection
- validation-failed item recording
- retry candidates for failed and validation-failed text items

## Verification

Run only:

```bash
pnpm test:focused -- packages/story-localization/src/story-localization.batch.integration.test.ts
pnpm test:focused -- packages/story-localization/src/generated-story-validator.unit.test.ts
```

If you add a dedicated workflow batch unit test in this batch, run that exact file too. Do not run broad tests.

## Commit gates

- After the Task 02 portion, provider artifacts must download but not import.
- After the Task 03 portion, import must be idempotent, `custom_id`-based, and independent of provider output order.
- Do not proceed if successful sibling imports are blocked by a failed item.

## Required report

Create or update:

```text
docs/reports/codex-runs/2026-07-09-batch-b-text-lifecycle-implementation-report.md
```

Include changed files, tests run, results, incomplete items, and the recommended next batch.
