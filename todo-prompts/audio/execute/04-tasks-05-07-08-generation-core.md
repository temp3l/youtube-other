# Batch 04 — Generation Core: Tasks 05, 07, and 08

## Recommended model

- Minimum: GPT-5, high reasoning
- Recommended: GPT-5.5, medium reasoning
- Best: GPT-5.5, high reasoning

This batch is a strict dependency chain. Implement 05, then 07, then 08.

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


Precondition: Tasks 01, 02, 03, 04, 06, and 09 are implemented and passing.

Implement in order:

1. `docs/plans/natural-openai-narration/tasks/05-performance-direction-planner.md`
2. `docs/plans/natural-openai-narration/tasks/07-openai-tts-request-builder.md`
3. `docs/plans/natural-openai-narration/tasks/08-chunk-cache-and-resume.md`

Create a checkpoint after each task.

### Task 05 requirements

- Implement deterministic role/variant defaults for mood, pace, intensity, restraint,
  pause intent, emphasis, flow, continuity, and negative constraints.
- Validate emphasis targets against chunk text.
- Add an optional structured OpenAI planner request builder, but retain deterministic fallback.
- One optional planner request should cover a language/variant rather than one request per chunk.
- Persist planner mode, versions, fingerprints, fallback metadata, and warnings.
- Do not synthesize audio.

### Task 07 requirements

- Build chunk-specific OpenAI TTS requests.
- Put only current spoken chunk text in `input`.
- Put previous/next context and delivery guidance only in `instructions`.
- Enforce input, context, and instruction budgets deterministically.
- Compose base voice settings, directions, pronunciation hints, continuity guidance,
  role, language, locale, pace, intensity, and negative constraints.
- Hash all materially relevant request inputs.
- Produce safe prompt-log metadata without secrets or excessive story text.
- Extend existing request types only where required.
- Prove with tests that context never enters synthesized input.

### Task 08 requirements

- Implement complete chunk fingerprints covering text, context, model, voice, speed,
  output format, language, instructions, direction, pronunciation, and schema/prompt versions.
- Reuse a chunk only when metadata, validation, output file, file hash, and fingerprint agree.
- Use temp files and atomic promotion.
- Preserve previously valid chunks when another chunk fails.
- Classify hit, miss, stale metadata, invalid output, validation failure, and provider failure separately.
- Add stale-artifact reporting and optional cleanup without deleting valid work by default.
- Ensure resumability and idempotency.

Strict non-goals:

- No final CLI integration.
- No assembly/mastering.
- No generic multi-provider framework.
- No real OpenAI API calls in CI.

After completion, run all focused tests for Tasks 05, 07, and 08 plus the relevant
foundation tests. Verify no neighboring context can be synthesized accidentally.
