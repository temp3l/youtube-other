# Task 07: Deterministic Shot Planner

## 1. Objective

Build a deterministic local planner that converts source scenes and image metadata into a `ShotPlan`.

## 2. Dependencies

Tasks 04, 05, and 06.

## 3. Likely Files

- New package such as `packages/visual-planning/src/index.ts`
- `packages/domain/src/index.ts`
- Planner unit tests.

## 4. Implementation Steps

- Accept platform, aspect ratio, scene timing, narrative phase, focal regions, pacing profile, visual budget, previous shot, next scene, restrictions, and seed.
- Allocate shot durations against narration boundaries where available.
- Enforce hook, setup, evidence, escalation, climax, and callback rules.
- Use deterministic seeded variation only.
- Keep unrelated metadata out of shot-plan fingerprint inputs.
- Produce 2-4 shots per source image by default while respecting budgets.

## 5. Tests

- `pnpm test:focused -- packages/visual-planning/src/shot-planner.unit.test.ts`

## 6. Acceptance Criteria

- Same inputs produce byte-stable shot plans.
- Shorts opening has at least three changes in the first eight seconds.
- Climax cadence is faster than setup.
- Generated source-image budget is not increased by shot planning.

## 7. Risks

- Planner can become visually repetitive across episodes. Seed with episode, scene, phase, and style while preserving determinism.

## 8. Parallelization

Serial after shared contracts. Do not parallelize conflicting schema edits.

## 9. Recommended Model

GPT-5.5 Medium. GPT-5.5 High may help if phase allocation becomes complex.

## 10. Commit Boundary

Commit planner and focused tests only.

