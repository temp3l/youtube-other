# VRI-06 scene visual plan

Date: 2026-08-09

Implemented the canonical deterministic scene visual-policy selector and bound
it to Veronica's existing semantic media-plan artifact. The planner now carries
canonical `veronicabenini` identity, narration revision/outline lineage,
configuration and source dependency hashes, per-scene source rationale, and a
fail-closed policy review. Context-only and forbidden sources are never
selected. The Strategic adapter maps source-policy denials to forbidden display
without provider calls or source mutation.

Changed files:

- `packages/visual-planning/src/scene-visual-policy.ts`
- `packages/visual-planning/src/index.ts`
- `packages/veronica-media/src/contracts/media-plan.v1.ts`
- `packages/veronica-media/src/planning/semantic-planner.ts`
- `packages/veronica-media/src/contracts/media-plan.v1.unit.test.ts`
- `packages/strategic-reinvention/src/scene-visual-plan-policy.ts`
- `packages/strategic-reinvention/src/index.ts`

Checks: `pnpm --filter @mediaforge/visual-planning build` (passed); `pnpm test:focused -- packages/visual-planning/src/scene-visual-policy.unit.test.ts` (2 passed); `pnpm test:focused -- packages/veronica-media/src/contracts/media-plan.v1.unit.test.ts` (4 passed); `git diff --check` (passed).

Risk/follow-up: the Strategic package typecheck remains blocked by its broader
unbuilt workspace dependency chain. The directly owned shared visual-planning
package builds successfully.
