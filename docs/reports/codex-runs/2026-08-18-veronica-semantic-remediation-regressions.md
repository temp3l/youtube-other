# Veronica semantic remediation regressions

Date: 2026-08-18

## Changed files

- `packages/strategic-reinvention/src/veronica-semantic-remediation-regressions.unit.test.ts`

## Checks

- `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 packages/strategic-reinvention/src/veronica-semantic-remediation-regressions.unit.test.ts` — intentionally red: current generic thesis emits the expert-positioning fallback for a business-model proposition.
- `pnpm exec prettier --check packages/strategic-reinvention/src/veronica-semantic-remediation-regressions.unit.test.ts` — initially failed; formatted the new test.
- `pnpm exec prettier --write packages/strategic-reinvention/src/veronica-semantic-remediation-regressions.unit.test.ts && pnpm exec prettier --check packages/strategic-reinvention/src/veronica-semantic-remediation-regressions.unit.test.ts` — passed.

## Risks and follow-up

The added tests are deliberately red until the V3 producer and portfolio validator expose typed evidence, concentration, subject-continuity, novelty, and thumbnail findings. No provider or network call was made.
