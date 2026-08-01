# Task 02: Promote Staged Narration

Status: In progress. The production matrix is defined and rollout/rollback
selection telemetry is implemented. Default promotion remains blocked until the
matrix in `docs/migrations/narration-rollout-evidence.md` has accepted evidence.

## Objective

Make staged narration the default production path and confine monolithic audio
generation to a time-bounded rollback window.

## Scope

`packages/config`, `packages/speech`, audio commands in `apps/cli`, Dark Truth
speech adapters, rollout documentation, and focused narration tests.

## Procedure

1. Define a representative production matrix covering full and Short variants,
   supported locales, resume, regeneration, and quality-gate outcomes.
2. Run `shadow` evidence gathering without changing downstream inputs.
3. Resolve quality or operational gaps; do not bypass `BLOCKED` or
   `REGENERATION_RECOMMENDED` states.
4. Change the default to `new` only after the matrix consistently produces
   accepted output.
5. Retain an explicit `legacy` rollback setting for one declared release window
   and record every use.
6. After a window with no rollback use, approve removal of the monolithic path
   in Task 07.

## Validation

- Focused config, CLI, and speech tests cover default selection and rollback.
- Resume and force behavior preserve deterministic staged artifacts.
- No paid-provider matrix is run without explicit authorization and a cost cap.

## Completion gate

New narration is the default, staged quality status is operator-visible, and
the rollback window has an owner, start, end, and usage evidence.
