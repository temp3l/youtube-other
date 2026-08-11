# Veronica planner compatibility regression

Date: 2026-08-11

## Changed files

- `packages/strategic-reinvention/src/positioning-production-adapter.unit.test.ts`
- This report.

## Tests and checks

- Focused compatibility filter over resolver and production-adapter unit files: 4 passed, 9 skipped.
- Covered Pack 2 deterministic derivation and adapter handoff, real 01a resolution, legacy resolver precedence with a different workspace/content ID, and legacy English-master production preparation.
- The legacy fixture now uses the real deterministic legacy planner output and exposes the canonical character-reference pack inside its temporary workspace.
- Strategic Reinvention typecheck: passed.
- `git diff --check`: passed.

## Risks and follow-up

Both compatibility paths are green. A broad file-level run also exposed an unrelated stale full-form partial-plan fixture; it was outside this regression filter and remains unchanged. No provider or production calls occurred.
