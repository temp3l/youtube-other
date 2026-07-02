# Task 02: Shot Domain Schemas

## 1. Objective

Add additive typed schemas for source visual scenes, render shots, shot plans, crops, motion, overlays, transitions, pacing profiles, budgets, focal regions, and validation issues.

## 2. Dependencies

Task 01.

## 3. Likely Files

- `packages/domain/src/index.ts`
- `packages/domain/src/*.unit.test.ts`

## 4. Implementation Steps

- Add branded or regex-validated shot IDs without breaking `sceneIdSchema`.
- Add `NormalizedCrop`, `FocalRegion`, `CameraMotion`, `ShotTreatment`, `ShotOverlay`, `ShotTransition`, `VisualPacingProfile`, `VisualBudget`, `VisualSourceScene`, `RenderShot`, `ShotPlan`, and `ShotPlanValidationIssue`.
- Keep `Scene` as the narrative/source-image model.
- Ensure schemas are additive and do not change existing `ScenePlan` parsing.
- Add schema tests for valid and invalid crops, shot timing, source scene references, treatment combinations, and issue codes.

## 5. Tests

- `pnpm test:focused -- packages/domain/src/shot-plan.unit.test.ts`
- `pnpm test:focused -- packages/domain/src/index.unit.test.ts`

## 6. Acceptance Criteria

- Existing domain tests pass.
- Shot schemas reject out-of-bounds crops, negative timings, invalid IDs, and unknown enum values.
- Existing manifests remain parseable.

## 7. Risks

- Putting too much policy into schemas can slow iteration. Keep business rules in validators.

## 8. Parallelization

Serial. Other tasks depend on these names.

## 9. Recommended Model

GPT-5.5 Medium, medium reasoning.

## 10. Commit Boundary

Commit domain schemas and tests only.

