# Task 06: Focal Metadata And Local Analysis Contract

## 1. Objective

Define focal-region metadata and conservative local analysis fallback for reusable regions inside source images.

## 2. Dependencies

Task 02.

## 3. Likely Files

- `packages/domain/src/index.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/image-generation/src/*.unit.test.ts`

## 4. Implementation Steps

- Add focal metadata shape for primary subject, face, evidence object, safe crop, negative space, foreground, background, and depth hints.
- Persist focal metadata alongside image visual plans or in `state/visual-retention/focal-metadata.json`.
- Add local fallback based on image dimensions, center/third regions, Sharp metadata, and safe conservative crops.
- Do not add heavyweight local models in this task.

## 5. Tests

- `pnpm test:focused -- packages/image-generation/src/episode-image-pipeline.unit.test.ts`
- `pnpm test:focused -- packages/domain/src/shot-plan.unit.test.ts`

## 6. Acceptance Criteria

- Legacy images can get conservative focal metadata without regeneration.
- Invalid focal regions are rejected.
- Existing image generation behavior remains unchanged.

## 7. Risks

- Over-trusting planner metadata. Validators must still check bounds and safety.

## 8. Parallelization

Can run in parallel with Tasks 04 and 05.

## 9. Recommended Model

GPT-5.5 Medium, medium reasoning.

## 10. Commit Boundary

Commit focal metadata contracts and tests only.

