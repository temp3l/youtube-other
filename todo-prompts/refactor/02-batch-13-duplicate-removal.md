# Codex Prompt — Refactor Batch 13: Duplicate Removal

Implement Batch 13 from `docs/refactor/02-safe-implementation-batches.md`.
Do not proceed unless current repository evidence shows Batch 12 is accepted.
Do not start Batch 14 in this task.

## Required reading

Read `AGENTS.md`, closer package instructions, `docs/ai-context/context-pack.md`,
`docs/development/codex-verification-guardrails.md`, and:

- `docs/refactor/02-safe-implementation-batches.md`, Batch 13
- `docs/refactor/03-compatibility-and-migration.md`
- `docs/refactor/06-duplicate-elimination.md`
- `docs/refactor/08-validation-and-release.md`
- `docs/refactor/audit/01-entrypoints-and-orchestration.md`
- `docs/refactor/audit/03-artifact-matrix.md`
- `docs/refactor/audit/05-duplicate-register.md`
- the accepted Batch 11 and Batch 12 Codex-run reports

Inspect current source and tests before relying on the audit. Record
`git status -sb`; preserve every pre-existing change; do not reset, clean,
restore, stage, or commit. Do not modify generated assets or production data.

## Required workflow

Process one family at a time in the order defined by
`06-duplicate-elimination.md`:

1. inventory every CLI, workflow, batch, repair, script, npm, test, and Codex
   caller;
2. characterize paths, schemas, output, logs, retries, cache, exits, and side
   effects;
3. classify differences as defect, strategy, compatibility, duplicate, or
   unresolved decision;
4. identify the registered canonical task/application owner;
5. add or confirm characterization tests before removal;
6. migrate any remaining direct caller through a thin adapter;
7. run focused family verification;
8. search again before deleting obsolete logic;
9. retain aliases whose support/removal condition has not passed.

Targeted searches must cover direct provider construction/endpoints, production
`path.join`/`path.resolve`, direct artifact writes outside repositories, prompt
reads outside the registry, success inferred only from existence/stat, alternate
state/cache/approval/override/batch writers, legacy command strings, and stale
imports. Review every match; do not treat low-level utilities or intentional
strategies as duplicates without evidence.

For each removal record the logical task, symbols/paths, former callers,
canonical replacement, retained adapter, tests, searches, compatibility result,
rollback method, and date/batch. Every retained adapter must state its exact
removal condition and replacement command.

Run affected tests first and honor a separate AGENTS.md verification budget per
implementation family. Do not run repository-wide tests or broad fixture
updates. Stop when a removal gate is unmet or failures stop converging; preserve
the compatibility adapter and report the evidence instead of forcing deletion.

Create `docs/reports/codex-runs/2026-07-14-batch-13-duplicate-removal.md` with
changed files, exact checks/results, removed implementations, retained adapters,
search findings, risks, follow-ups, and current commit hash. Update Batch 13
status only if one canonical application implementation remains per logical
task or every retained adapter is explicitly accepted compatibility debt.
Confirm no paid provider, upload, publish, remote render, or production-media
operation ran.

