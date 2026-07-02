# Batch 03 — Foundation Stages: Tasks 03, 04, 06, and 09

## Recommended model

- Minimum: GPT-5, medium reasoning
- Recommended: GPT-5, high reasoning
- Best: GPT-5.5, medium reasoning

These tasks are logically independent after Task 02. Implement them sequentially in this
session because they share `narration-schemas.ts` and `packages/speech/src/index.ts`.

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

Precondition: Tasks 01 and 02 are implemented and passing.

Implement the following tasks in order, with a checkpoint and focused validation after each:

1. `docs/plans/natural-openai-narration/tasks/03-spoken-narration-preparation.md`
2. `docs/plans/natural-openai-narration/tasks/04-deterministic-beat-segmentation.md`
3. `docs/plans/natural-openai-narration/tasks/06-pronunciation-normalization.md`
4. `docs/plans/natural-openai-narration/tasks/09-chunk-technical-validation.md`

### Task 03 requirements

- Preserve canonical localized story text.
- Implement deterministic spoken-text preparation.
- Persist reviewable `spoken-text.md` and metadata.
- Keep any future AI adaptation shape optional and inactive by default.
- Preserve source fingerprints and detect excessive word-count drift.
- Never log full narration text.

### Task 04 requirements

- Implement deterministic paragraph/sentence parsing and duration-aware chunking.
- Use language-aware WPM profiles.
- Prefer paragraph, narrative-role, and coherent beat boundaries.
- Produce stable ordered chunk IDs and previous/next context excerpts.
- Enforce minimum/maximum duration and word budgets.
- Use deterministic fallback from preferred segmentation to paragraph packing, then sentence packing.
- Avoid normal sentence-by-sentence output.

### Task 06 requirements

- Implement global, language, profile, and episode pronunciation scopes.
- Apply longest-priority, boundary-safe replacements only to TTS input.
- Do not use arbitrary executable regex.
- Detect collisions, overlaps, unused optional entries, and unresolved mandatory entries.
- Persist an auditable transformation report.
- Compile matchers once per language/episode where practical.

### Task 09 requirements

- Reuse or extract existing WAV/audio analysis.
- Wrap FFprobe through the existing process runner.
- Produce persisted error/warning/info findings.
- Include duration, decoding, sample-rate, channels, silence, clipping/peak, and plausible WPM checks.
- Avoid rejecting usable audio for minor duration drift.
- Validate probed paths remain under the expected narration artifact root.
- Avoid repeated waveform scans where metadata is sufficient.

After all four tasks:

- run all four focused test files;
- run relevant speech package tests and type-checks;
- rerun Task 01 and Task 02 focused tests;
- inspect exports for circular imports and accidental coupling;
- verify no OpenAI call or pipeline orchestration was introduced.
