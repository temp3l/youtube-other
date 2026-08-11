# Veronica canonical planner-input consumer

Date: 2026-08-11

## Changed files

- `packages/strategic-reinvention/src/veronica-visual-plan-resolver.ts`
- `packages/strategic-reinvention/src/veronica-visual-plan-resolver.unit.test.ts`
- `packages/strategic-reinvention/src/veronica-content-pack-2-ingestion.ts`
- `packages/strategic-reinvention/src/positioning-visual-planner.ts`
- `packages/strategic-reinvention/src/positioning-opening-treatments.ts`
- `packages/strategic-reinvention/src/positioning-visual-contracts.ts`
- `packages/strategic-reinvention/src/positioning-production-adapter.ts`
- `packages/strategic-reinvention/src/index.ts`
- `docs/architecture/veronica-source-pack-ingestion.md`

## Summary

Added a runtime-validated visual-plan resolver with explicit legacy/derived precedence, deterministic planner execution, hash-based staleness, typed failures, and derivation evidence. Production preparation now resolves rather than blindly reads `source/visual-plan.json`. The real 01a source resolves in a temporary workspace without provider calls.

## Tests and checks

- Resolver focused test: target handoff passed; all resolver cases later passed in the combined run.
- Combined resolver, Pack 2 ingestion, and production-adapter tests: 16/17 passed. The legacy adapter fixture exposed an overly strict workspace/content-ID comparison; fixed by applying identity equality only to derived plans. Verification budget prevented another test rerun.
- Strategic Reinvention typecheck: passed after the compatibility fix.
- `git diff --check`: passed.

## Risks and follow-up

Rerun the three focused files to verify the final legacy compatibility adjustment. Full pre-image execution remains a separate task. Provider calls: zero.
