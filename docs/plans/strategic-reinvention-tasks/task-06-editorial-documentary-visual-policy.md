# Task 06: Editorial-Documentary Visual Policy

## Objective

Add independent creator-led composition plans without inheriting Dark Truth cinematic defaults.

## Dependencies And Parallelism

Depends on Task 03. Safe in parallel with Tasks 04 and 05.

## Exclusive Ownership

- new `packages/visual-planning/src/editorial-documentary-plan.ts` and test
- visual-planning exports
- new policy-gate module/test in `packages/image-generation/src/`

Do not edit strategic task registration or rendering integration.

## Required Behavior

- Support typography, diagrams, timelines, decision trees, worksheets, supplied creator media, B-roll, and restrained illustration.
- Produce structurally independent 16:9 and 9:16 plans with stable beat IDs.
- Require source/media rights for supplied assets.
- Block synthetic likeness before any image provider call.
- Keep generic rendering free of creator-specific logic.

## Verification

```bash
pnpm test:focused -- packages/visual-planning/src/editorial-documentary-plan.unit.test.ts
pnpm test:focused -- packages/image-generation/src/creator-media-policy.unit.test.ts
```

## Acceptance

A landscape crop cannot satisfy the portrait contract; prohibited likeness produces zero provider mutations; plans retain beat/source lineage.

Lead checkpoint: `feat(visuals): add editorial documentary composition plans`.
