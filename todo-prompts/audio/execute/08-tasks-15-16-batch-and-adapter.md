# Batch 08 — Batch Failure Handling and Dark Truth Adapter: Tasks 15 and 16

## Recommended model

- Minimum: GPT-5, high reasoning
- Recommended: GPT-5.5, high reasoning
- Best: GPT-5.5, high reasoning

This is the most integration-heavy batch. Implement sequentially.

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


Precondition: Task 13 is implemented and passing.
Task 15 requires Tasks 08, 12, and 13.
Task 16 requires Tasks 04, 08, 10, and 13.

Implement:

1. `docs/plans/natural-openai-narration/tasks/15-batch-partial-failure-status.md`
2. `docs/plans/natural-openai-narration/tasks/16-dark-truth-compatibility-adapter.md`

### Task 15 requirements

- Add per-target status records for episode/language/variant jobs.
- Continue unrelated targets after configuration, provider, validation, assembly, or unknown failures.
- Summarize success, warning, blocked, and failed counts.
- Add status inspection consistent with existing CLI output conventions.
- Add strict-mode exit-code behavior without changing default partial-success preservation.
- Validate requested languages and variants before mutation.
- Use bounded chunk concurrency and conservative target/language concurrency.
- Preserve all successful outputs when another target fails.
- Never expose full narration text or secrets in status output.
- Add tests for mixed success/failure, all-failed, warning-only, blocked, strict mode,
  resume, and independent target continuation.

### Task 16 requirements

- Inspect the current `packages/dark-truth` `SpeechPlan`, `SpeechSegment`,
  `generateNarrationAudio`, `generateMockNarrationAudio`, and hash/manifest behavior.
- Map `SpeechPlan.segments` into the canonical narration chunk manifest.
- Map pace, intensity, pauses, and available segment metadata into directions.
- Preserve existing `narration-manifest.json` and compatibility output contracts.
- Delegate to the new narration pipeline only when the feature flag enables adapter mode.
- Keep the legacy Dark Truth path available during rollout.
- Reuse cache fingerprints from segment text and speech-plan hashes.
- Validate IDs, ordering, hashes, language, variant/artifact type, and compatibility metadata.
- Do not refactor source-pack parsing.
- Add tests proving old workflows still pass and the adapter produces compatible outputs.

Integration review:

- inspect overlapping changes to `apps/cli/src/index.ts`, `narration-pipeline.ts`,
  `packages/speech/src/index.ts`, and `packages/dark-truth/src/index.ts`;
- ensure Task 15 failure isolation also applies appropriately to adapter-backed targets;
- ensure fallback use is explicit and observable;
- rerun existing Dark Truth tests and all relevant CLI pipeline tests.
