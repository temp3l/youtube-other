# Batch 06 — Task 13: CLI Integration

## Recommended model

- Minimum: GPT-5, high reasoning
- Recommended: GPT-5.5, medium reasoning
- Best: GPT-5.5, high reasoning

This is a high-risk integration checkpoint.

## Codex prompt


You are implementing a planned production-grade TypeScript change in an existing story-to-video monorepo.

General rules:

- This is implementation work, not planning.
- Read every referenced task file and the relevant architecture documents before editing.
- Inspect existing symbols, conventions, schemas, error classes, observability, path helpers, and tests before introducing new abstractions.
- Reuse existing repository utilities and types where sound.
- Keep strict TypeScript compatibility.
- Do not use `any`, broad unsafe casts, non-null assertions, shell interpolation, or secret-bearing metadata.
- Do not implement later tasks early.
- Preserve existing production behavior unless the current task explicitly introduces a feature-flagged path.
- Keep changes additive and rollback-safe.
- Add concise TSDoc and inline comments only where behavior or invariants are non-obvious.
- Use runtime validation at artifact and external-input boundaries.
- Do not call the real OpenAI API in normal tests.
- Before finishing each task, inspect the diff, run the focused test from the task file, run the narrowest relevant type-check/tests available, and run `git diff --check`.
- Do not claim a test passed unless it was executed.
- After each task, create a clean checkpoint or commit before starting the next task in the batch.


Precondition: Tasks 01 through 12 are implemented and passing.

Implement:

`docs/plans/natural-openai-narration/tasks/13-cli-integration.md`

Inspect existing Commander registration, `audio generate`, story-pipeline commands,
runtime configuration, status output, exit-code conventions, and tests before changing code.

Required behavior:

- Add a `NarrationPipeline` orchestrator in `packages/speech`.
- Add staged narration commands consistent with current CLI conventions, covering prepare,
  plan, generate, assemble, validate, status, and inspect.
- Support episode, language, variant, all-language/all-variant orchestration, resume, force,
  validation-only, dry-run, inspect/status, and bounded concurrency where consistent with
  existing CLI style.
- Keep the normal production command simple.
- Preserve existing `audio generate` behavior by default.
- Add rollout configuration with at least `legacy` and `new`; include `shadow` only if the
  architecture plan and current config conventions support it cleanly.
- Do not rerun valid completed stages unless forced.
- Return structured per-stage results and documented machine-readable exit codes.
- Keep API keys and secret values out of JSON/status output.
- Add unit/integration tests for dry-run, status, invalid inputs, resume, force, rollout mode,
  and preservation of legacy behavior.

Migration safety:

- New mode must be explicitly enabled.
- Existing CLI tests must continue to pass.
- Failure in the new path must not silently corrupt or replace a valid legacy output.
- Avoid a broad repo-wide CLI refactor.
- Keep orchestration in the speech package rather than embedding all behavior into
  `apps/cli/src/index.ts`.

Before finishing:

- run all new CLI focused tests;
- rerun existing `audio generate` tests;
- run relevant speech/config/CLI type-checks and tests;
- inspect help text and JSON output for secrets;
- manually inspect the mode switch and rollback path.
