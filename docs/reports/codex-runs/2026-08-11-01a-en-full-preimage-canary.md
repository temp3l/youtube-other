# 01a EN full pre-image canary

Date: 2026-08-11

## Changed files

- `apps/cli/src/index.ts`: defer selected-audio timing reconciliation until the canonical semantic plan exists.
- `packages/speech/src/veronica-short-pacing.ts`: use the bounded correction when WPM is outside the soft range.
- `packages/speech/src/veronica-short-pacing.unit.test.ts`: cover soft-range correction.
- `packages/strategic-reinvention/src/positioning-production-adapter.ts`: prevent paid source-grounded QA dispatch until deterministic visual readiness passes.
- `packages/strategic-reinvention/src/positioning-production-adapter.unit.test.ts`: cover deterministic QA eligibility.
- `episodes/01a-revenue-is-not-a-good-business/`: generated EN source, audio, timing, planning, prompt, and QA artifacts (ignored production workspace).

## Checks

- Veronica pacing unit test: 9 passed.
- Production-adapter unit file: new gate test and three adjacent tests passed; one unrelated pre-existing full-form fixture failed because `masterNarrationHash` is absent.
- Strategic Reinvention typecheck: passed.
- Speech, CLI, and Strategic Reinvention builds: passed.
- `git diff --check`: passed before this report.

## Result and risks

Blocked. Selected audio is 71.6 seconds at natural pacing. Deterministic planning fails on unresolved prompt placeholders, unsupported doorway motifs, a missing visible thesis, and semantic remediation quality. The first run exposed and spent four QA calls before the fail-closed guard was fixed; the guarded rerun made zero calls. Beat and sequence QA remain unavailable, and no visual-beat artifact was materialized. No image, thumbnail, render, publication, or playlist calls occurred.

## Follow-up

Repair the smallest deterministic planning units for HOOK, S01, S02, and S06, materialize beat planning, then rerun deterministic QA before any paid QA.
