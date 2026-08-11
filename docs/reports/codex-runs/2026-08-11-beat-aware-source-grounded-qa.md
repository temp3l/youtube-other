# Beat-aware source-grounded QA

Date: 2026-08-11

## Changed files

- `packages/strategic-reinvention/src/source-grounded-visual-qa.ts`
- `packages/strategic-reinvention/src/source-grounded-visual-qa.unit.test.ts`
- `packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.ts`
- `packages/strategic-reinvention/src/positioning-production-adapter.ts`
- `apps/cli/src/veronica-source-grounded-visual-qa-composition.ts`
- `apps/cli/src/veronica-pre-image-review-pack.ts`
- `docs/architecture/veronica-supplemental-media/overview.md`

## Result

Added strict beat judgement contracts, evidence-bearing beat inputs, per-beat cache identity, shared batched/cost-controlled execution, beat-sequence summaries, fail-closed hierarchy blockers, provenance/accounting, fixture support, and review-pack projection. Parent scene PASS cannot authorize a failed child beat. Provider semantic QA remains separate. Parent failure now defers paid beat QA.

L05 remains 6 scenes, 10 new-image beats, 10 unique assets, and 10 provider prompts (10 deterministic prompt PASS). The live QA run failed closed: three pre-dispatch reservations encountered `Connection error`; zero completed QA calls, zero usage tokens, and zero image calls. Network escalation was rejected because the workspace is out of credits. Persisted verdicts are 6 scene UNAVAILABLE, 10 beat UNAVAILABLE, sequence UNAVAILABLE.

## Tests/checks

- Focused Vitest: 40/40 PASS.
- Strategic Reinvention and CLI TypeScript builds: PASS.
- `git diff --check`: PASS.

## Remaining risk / follow-up

Restore workspace credits/network authorization, rerun the bounded L05 `source-grounded-qa` command, then remediate only judged blocked beats if necessary. Human approval is not yet the only remaining gate.
