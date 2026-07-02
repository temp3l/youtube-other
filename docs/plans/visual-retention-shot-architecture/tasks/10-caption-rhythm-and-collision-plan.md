# Task 10: Caption Rhythm And Collision Plan

## 1. Objective

Plan and validate dynamic Shorts captions that complement shots without being the only visual change.

## 2. Dependencies

Tasks 06, 07, and 09.

## 3. Likely Files

- `packages/alignment/src/index.ts`
- `packages/domain/src/index.ts`
- `packages/visual-planning/src/*`

## 4. Implementation Steps

- Add phrase-based caption plan for Shorts using existing transcript segments and word timings where available.
- Enforce max two lines and mobile-safe placement.
- Add collision detection against focal regions, evidence inserts, and branding safe areas.
- Preserve sidecar generation and existing ASS/SRT/VTT outputs.
- Do not add word-by-word bouncing by default.

## 5. Tests

- `pnpm test:focused -- packages/alignment/src/index.unit.test.ts`
- `pnpm test:focused -- packages/visual-planning/src/caption-collision.unit.test.ts`

## 6. Acceptance Criteria

- Captions avoid protected regions or produce validation errors.
- Caption updates are not counted as sole meaningful visual changes.
- Existing caption sidecars remain compatible.

## 7. Risks

- Phrase segmentation can diverge from localization. Use localized transcript/script as source for each locale.

## 8. Parallelization

Can run after Task 07 if it does not modify renderer contracts.

## 9. Recommended Model

GPT-5.5 Medium, medium reasoning.

## 10. Commit Boundary

Commit caption planning/collision logic and tests only.

