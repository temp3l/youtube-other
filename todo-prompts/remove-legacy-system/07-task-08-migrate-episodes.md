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

# Task 08 — Migrate repository-owned episodes

## Model recommendation

Minimum: GPT-5.4
Best: GPT-5.5

## Assigned task

- `docs/plans/remove-legacy-and-normalize-paths/tasks/08-migrate-repository-owned-episodes.md`

## Goal

Apply only safe repository-owned script migrations using the Task 07 utility.

## Mandatory gate

1. Run and save a complete dry-run report.
2. Review every divergent duplicate, collision, uncertain owner, unsupported layout, or destructive proposal.
3. Do not guess or resolve conflicts automatically.
4. Run write mode only for entries classified as mechanically safe.

If the migration requires a human content decision, stop those entries and produce a precise resolution list.

## Requirements

Canonical authored targets:

```text
languages/script-<language>.md
languages/short/script-<language>.md
```

- Migrate authored repository scripts only.
- Do not delete or reclassify generated outputs.
- Preserve compatibility copies needed by still-unmigrated consumers; final removal belongs to Task 19.
- Prefer filesystem moves that preserve understandable Git history.
- Save/commit the migration report in the repository location defined by the plan.
- Verify episode 022 English and German.
- Rerun dry-run after safe writes.

## Validation

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
```

The final dry-run must clearly separate resolved safe moves from unresolved manual conflicts.
