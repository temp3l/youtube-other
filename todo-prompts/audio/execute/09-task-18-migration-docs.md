# Batch 09 — Task 18: Migration, Deprecation, and Documentation

## Recommended model

- Minimum: GPT-5 mini, high reasoning
- Recommended: GPT-5, medium reasoning
- Best: GPT-5.5, low reasoning

Run only after every production task is merged and validated.

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


Precondition: Tasks 01 through 17 are implemented, merged, and passing.

Implement:

`docs/plans/natural-openai-narration/tasks/18-migration-deprecation-and-docs.md`

Required work:

- Inspect actual implemented command names, flags, rollout modes, paths, reports, schemas,
  and feature flags. Do not copy stale names from the plan.
- Document legacy, shadow (if implemented), and new modes.
- Document narration artifact roots, compatibility outputs, clean/mastered outputs,
  reports, benchmark artifacts, cache records, and status commands.
- Document normal production usage, staged inspection commands, resume, force,
  validation-only, dry-run, and strict batch behavior.
- Document migration for already-generated episodes.
- Document fallback and rollback procedures.
- Document operator responses to warning, regeneration-recommended, blocked, and partial-failure states.
- Document observability fields, cost controls, redaction rules, and report locations.
- Identify obsolete/duplicated paths with explicit deletion criteria, not immediate deletion.
- Update architecture, command, and pipeline documentation listed in the task.
- Update the implementation roadmap status only where actual implementation differs.
- Verify all paths and commands against source and tests.
- Run CLI help/path checks and documentation-related tests if present.

Strict non-goals:

- No broad production refactor.
- No deletion of legacy paths unless separately approved and all documented deletion criteria are met.
- No invented command, flag, artifact, metric, or rollout mode.

Final report must list:

- documents changed;
- exact rollout and rollback procedure;
- compatibility guarantees;
- obsolete paths and deletion criteria;
- validation commands run;
- any remaining operational risks.
