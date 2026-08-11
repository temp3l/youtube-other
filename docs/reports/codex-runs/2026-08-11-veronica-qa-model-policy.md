# Veronica QA model policy

## Summary

Routine source-grounded QA escalation and remediation now use `gpt-5.6-terra` with medium reasoning. Scene and sequence judging remain `gpt-5.4-mini` with low reasoning. Luna is not promoted. Sol is disabled by default and can only be enabled as final adjudication with both paid-QA authorization and an independent per-pack cap.

## Changed paths

- `apps/cli/src/veronica-source-grounded-visual-qa-composition.ts`
- `apps/cli/src/veronica-source-grounded-visual-qa-composition.unit.test.ts`
- `apps/cli/src/veronica-media-commands.ts`
- `apps/cli/src/veronica-media-commands.unit.test.ts`
- `docs/reports/codex-runs/2026-08-11-veronica-qa-model-policy.md`

## Tests/checks

- Targeted ESLint and `git diff --check` — passed.
- The focused composition test exposed its stale built-package resolver before the scheduler assertion; no package build or episode regeneration was run.

## Commit hash

`c4e786f742a75489bb1a725fa7fc07d50328d167`

## Unresolved risks

No live Luna benchmark was run: its required hard provider-call and spend caps were not specified. Sequence benchmarking remains separate and required before any sequence-default promotion.
