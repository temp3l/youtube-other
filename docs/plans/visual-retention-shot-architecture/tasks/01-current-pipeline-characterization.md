# Task 01: Current Pipeline Characterization

## 1. Objective

Create characterization coverage and notes for the existing scene-image-render pipeline before introducing shot planning.

## 2. Dependencies

None.

## 3. Likely Files

- `packages/scene-planning/src/index.unit.test.ts`
- `packages/image-generation/src/shorts-image-strategy.unit.test.ts`
- `packages/rendering/src/index.unit.test.ts`
- `apps/cli/src/episode-commands.unit.test.ts`
- `docs/plans/visual-retention-shot-architecture/architecture-plan.md`

## 4. Implementation Steps

- Characterize that `OneToOneScenePlanner` defaults to 5-6 second visual scene windows.
- Characterize that `FFmpegVideoRenderer` emits one clip per scene ID.
- Characterize that `shorts-image-strategy` creates one portrait output per scene and does not render temporal motion.
- Characterize Dark Truth retiming, scene audio slicing, and sidecar subtitle behavior.
- Record exact current manifest and cache fields used by image generation and rendering.

## 5. Tests

- `pnpm test:focused -- packages/scene-planning/src/index.unit.test.ts`
- `pnpm test:focused -- packages/image-generation/src/shorts-image-strategy.unit.test.ts`
- `pnpm test:focused -- packages/rendering/src/index.unit.test.ts`

## 6. Acceptance Criteria

- Existing behavior is documented with file and symbol references.
- Tests protect the current one-scene-one-clip behavior before refactor.
- No production behavior changes.

## 7. Risks

- Broad characterization tests may overfit implementation details. Prefer semantic assertions.

## 8. Parallelization

Do first. Do not parallelize with schema changes.

## 9. Recommended Model

GPT-5.5 Medium, medium reasoning.

## 10. Commit Boundary

Commit characterization tests and documentation only.

