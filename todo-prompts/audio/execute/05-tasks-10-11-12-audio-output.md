# Batch 05 — Audio Output and Quality: Tasks 10, 11, and 12

## Recommended model

- Minimum: GPT-5, high reasoning
- Recommended: GPT-5.5, medium reasoning
- Best: GPT-5.5, high reasoning

Implement this strict dependency chain in order.

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


Precondition: Tasks 01 through 10's prerequisites are implemented, including Tasks 04, 08, and 09.

Implement:

1. `docs/plans/natural-openai-narration/tasks/10-manifest-assembly-and-continuity.md`
2. `docs/plans/natural-openai-narration/tasks/11-mastering-profiles.md`
3. `docs/plans/natural-openai-narration/tasks/12-quality-gate-and-reports.md`

Create a checkpoint and run focused validation after each task.

### Task 10 requirements

- Build an explicit ordered assembly manifest from chunk manifest, directions, cache records,
  and validation reports.
- Reject missing, duplicate, invalid, and out-of-order chunks.
- Never rely on filename sort order.
- Generate FFmpeg arguments safely through arrays/process runner APIs.
- Add configurable safe trimming, retained boundary silence, pause insertion, and optional
  cautious equal-power crossfades.
- Do not overlap spoken words or erase intentional pauses.
- Write to temp output and validate before atomic promotion.
- Preserve the previous valid narration when assembly is blocked.

### Task 11 requirements

- Add strongly typed, validated mastering profiles.
- Keep clean assembled narration as an independent artifact.
- Implement conservative FFmpeg filters for high-pass, corrective EQ, light compression,
  optional de-essing, loudness normalization, and true-peak limiting.
- Keep effects optional and conservative by default.
- Support clean narration, render-ready narration, Shorts, and full-length profiles where
  justified by the plan.
- Persist profile versions, config fingerprints, measured metadata, warnings, and status.
- If mastering fails, preserve clean narration and structured failure metadata.

### Task 12 requirements

- Aggregate generation, chunk validation, assembly, mastering, fallback, and compatibility state.
- Produce JSON and Markdown reports.
- Return exactly the four planned outcomes:
  `READY`, `READY_WITH_WARNINGS`, `REGENERATION_RECOMMENDED`, and `BLOCKED`.
- Expected validation failures should yield a report rather than an uncaught exception.
- Report missing chunks, invalid ordering, validation failures, loudness issues, fallback use,
  and compatibility-output status.
- Do not require an AI subjective review.

Strict non-goals:

- No music or SFX mixing.
- No CLI migration.
- No aggressive mastering.
- No shell-command interpolation.

After completion, run all focused tests for Tasks 09–12 and relevant package checks.
Use deterministic local audio fixtures; do not call OpenAI.
