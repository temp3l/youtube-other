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

# Task 04 — Application orchestration

## Model recommendation

Minimum: GPT-5.4
Best: GPT-5.5

## Assigned task

- `docs/plans/remove-legacy-and-normalize-paths/tasks/04-refactor-application-orchestration.md`

## Goal

Create the stable typed application boundary between CLI/API/workers and low-level Dark Truth services.

## Requirements

- Map the current full-video and Short orchestration before editing.
- Introduce typed use cases for active full and Short setup.
- Include explicit episode, language, variant, dry-run, validation-only, force, and resume inputs.
- Resolve scripts centrally inside the application boundary.
- Move sequencing out of CLI handlers.
- Keep lower-level packages focused on domain or infrastructure operations.
- Preserve dependency direction and avoid circular package dependencies.
- Preserve active outputs, logs, errors, resume semantics, and dry-run behavior.
- Keep old functions until parity is proven.
- Do not remove legacy code in this task.
- Prefer narrow adapters over duplicated orchestration.

## Tests

Prove:

- full setup parity;
- Short setup parity;
- CLI delegation to use cases;
- no CLI-local authored-script path construction;
- correct propagation of dry-run, validation-only, force, and resume;
- typed resolver errors remain observable.

## Validation

```bash
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm test:focused -- apps/cli/src/index.unit.test.ts
```

Typecheck every affected package.
