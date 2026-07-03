# Codex Implementation Prompt

## Repository context

The implementation plan is located at:

```text
docs/plans/remove-legacy-and-normalize-paths/
```

Before changing code, read:

- `docs/plans/remove-legacy-and-normalize-paths/00-executive-summary.md`
- `docs/plans/remove-legacy-and-normalize-paths/16-risk-register.md`
- `docs/plans/remove-legacy-and-normalize-paths/18-implementation-order.md`
- `docs/plans/remove-legacy-and-normalize-paths/19-final-cleanup-checklist.md`
- every task file assigned in this prompt
- `AGENTS.md` and all repository-local instruction files

## Operating rules

Act as a senior TypeScript monorepo engineer performing a production-critical refactor.

- Work only on the tasks assigned in this prompt.
- Preserve active Dark Truth full-video and Short behavior.
- Keep strict TypeScript safety; avoid `any`, unsafe casts, duplicated schemas, and unvalidated path strings.
- Do not make paid OpenAI, image, speech, transcription, rendering, or other provider calls.
- Use mocks, fixtures, dry runs, and deterministic local tests.
- Do not weaken assertions or delete tests merely to make the suite pass.
- Do not update unrelated dependencies or reformat unrelated files.
- Do not delete production data.
- Do not silently resolve divergent files, ambiguous paths, external contracts, or migration collisions.
- Respect every human-review or rollout gate in the task documents.
- Inspect current code and searches before trusting assumptions in the plan.
- Do not commit unless repository instructions explicitly require it.

## Required workflow

1. Check the current branch and working tree.
2. Read all assigned task documents and relevant architecture documents.
3. Search for all affected imports, call sites, tests, fixtures, configuration, and documentation.
4. Write a concise implementation checklist in the Codex session.
5. Implement in the sequence specified below.
6. Run focused validation after each phase.
7. Stop rather than guessing when a stated approval or manual-review gate is missing.

## Final report

Report:

- files changed;
- behavior preserved and intentionally changed;
- validation commands and outcomes;
- searches performed and remaining matches;
- skipped checks and reasons;
- unresolved risks or required human decisions;
- the next safe task or batch.

# Task 01 — Characterization tests

## Model recommendation

Minimum: GPT-5.4 mini
Best: GPT-5.5

## Assigned task

- `docs/plans/remove-legacy-and-normalize-paths/tasks/01-add-dark-truth-characterization-tests.md`

## Goal

Create the safety net required before any production or legacy code is removed.

## Implementation requirements

- Characterize active CLI command registration and application setup.
- Cover Dark Truth full-video and Short setup.
- Add episode 022 English and German canonical-path fixtures.
- Cover multilingual script handling and cache isolation.
- Document current unsafe or ambiguous behavior with clearly named tests.
- Distinguish desired Dark Truth behavior from temporary legacy characterization.
- Use mocks and dry-run paths only.
- Do not remove or refactor production code except for a minimal behavior-neutral test seam when unavoidable.
- Do not delete existing tests or weaken assertions.

## Validation

```bash
pnpm test:focused -- apps/cli/src/story-full-rewrite-command.unit.test.ts
pnpm test:focused -- apps/cli/src/story-short-rewrite-command.unit.test.ts
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
```

Run all additional focused tests for files changed.

## Exit criteria

- Full and Short setup are characterized.
- Episode 022 English and German are covered.
- Legacy assumptions are explicitly labelled.
- No network or paid API calls occurred.
