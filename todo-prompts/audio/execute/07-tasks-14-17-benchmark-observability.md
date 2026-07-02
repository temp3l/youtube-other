# Batch 07 — Voice Benchmarking and Observability: Tasks 14 and 17

## Recommended model

- Minimum: GPT-5, medium reasoning
- Recommended: GPT-5.5, medium reasoning
- Best: GPT-5.5, high reasoning

The tasks are logically parallel-safe after their dependencies, but they share speech exports.
Implement them sequentially in one session to avoid merge conflicts.

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


Precondition: Task 13 is implemented. Task 14 also requires Tasks 07 and 09.
Task 17 requires Tasks 08 and 12.

Implement:

1. `docs/plans/natural-openai-narration/tasks/14-voice-benchmarking.md`
2. `docs/plans/natural-openai-narration/tasks/17-observability-and-cost-controls.md`

### Task 14 requirements

- Add an OpenAI-only voice benchmark command.
- Use one standardized passage covering hook, exposition, proper name, date/number,
  realization, urgency, restrained reveal, and unsettling final line.
- Generate configured voices with identical model/instructions/speed/language.
- Randomize or anonymize labels by default while preserving reversible metadata.
- Persist voice, model, instructions fingerprint, speed, language, timestamp, source hash,
  audio duration, output path, status, and evaluator score template.
- Allow one voice failure without blocking other samples.
- Cache benchmark outputs by all material inputs.
- Limit sample count by default to control cost.
- Support global, language, channel, and variant decisions without rotating voices inside a story.
- Unit tests must mock provider calls.

### Task 17 requirements

- Add structured narration telemetry helpers.
- Record episode, language, variant, chunk ID, stage, model, voice, attempt, latency,
  input size, output size, generated seconds, cache decision, validation result,
  retry/failure class, regeneration, and fallback use.
- Add cost-relevant character/audio-duration estimates using existing pricing abstractions
  where possible, without fabricating current prices.
- Telemetry failures must never fail narration generation.
- Never log API keys, authorization headers, secrets, full stories, raw audio, or excessive chunk text.
- Keep overhead negligible and payloads bounded.
- Add tests for redaction, invalid event fields, non-fatal telemetry failure, and counters.

After completion:

- run focused tests for Tasks 14 and 17;
- rerun CLI integration tests affected by the benchmark command;
- inspect logs/JSON artifacts for accidental sensitive data;
- verify benchmark generation remains opt-in and cost-bounded.
