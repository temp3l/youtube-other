# Set Veronica routine QA models

## Summary

Updated the shared Veronica source-grounded QA composition used by every episode. Routine escalation and remediation now use `gpt-5.6-terra` with medium reasoning. Scene and sequence judging remain `gpt-5.4-mini` with low reasoning. No episode artifacts were regenerated and no OpenAI calls were made.

## Changed paths

- `apps/cli/src/veronica-source-grounded-visual-qa-composition.ts`
- `apps/cli/src/veronica-source-grounded-visual-qa-composition.unit.test.ts`
- `docs/reports/codex-runs/2026-08-11-set-veronica-routine-qa-models.md`

## Tests/checks

- `pnpm test:focused -- apps/cli/src/veronica-source-grounded-visual-qa-composition.unit.test.ts` — passed (3 tests).
- Targeted ESLint and `git diff --check` — passed.

## Commit hash

`c4e786f742a75489bb1a725fa7fc07d50328d167`

## Unresolved risks

Existing cached and historical QA artifacts retain their earlier model provenance until an explicitly authorized paid re-run.
