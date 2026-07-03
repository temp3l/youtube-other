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

# Task 07 — Episode layout migration tool

## Model recommendation

Minimum: GPT-5.4
Best: GPT-5.5

## Assigned task

- `docs/plans/remove-legacy-and-normalize-paths/tasks/07-build-episode-layout-migration-tool.md`

## Goal

Build a deterministic dry-run-first inventory and migration utility. Do not migrate repository episode files in this task.

## Requirements

- Walk `episodes/` while excluding generated output, transient state, cache, render, and other non-authored trees based on repository evidence.
- Detect every known authored-script candidate.
- Compute raw byte hashes and normalized-content hashes using a documented normalization policy.
- Derive canonical targets from the shared resolver rules.
- Classify:
  - already canonical;
  - safe move;
  - identical duplicate;
  - divergent duplicate;
  - target collision;
  - stale/unsupported layout;
  - invalid language or variant;
  - filesystem error.
- Produce deterministic human-readable and JSON reports.
- Default to dry-run.
- Require explicit `--write` for mutation.
- In write mode, perform only mechanically safe, non-overwriting moves.
- Never overwrite, merge divergent content, or delete generated assets.
- Include rollback metadata for every proposed/performed move.
- Cover episode 022 English and German.
- Implement write mode, but do not run write mode against repository episodes.

## Validation

```bash
pnpm test:focused -- <actual-migration-tool-test>
pnpm mediaforge -- <actual-migration-command> --dry-run --json
```

Discover and use the actual command and test paths.
