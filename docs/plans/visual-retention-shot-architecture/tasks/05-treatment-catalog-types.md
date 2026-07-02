# Task 05: Treatment Catalog Types

## 1. Objective

Implement the typed shot-treatment catalog used by planner, validator, renderer, and reports.

## 2. Dependencies

Task 02.

## 3. Likely Files

- `packages/domain/src/index.ts`
- New visual planning package or `packages/rendering/src/*` only if treatment compatibility lives near renderer.

## 4. Implementation Steps

- Encode treatment IDs, capabilities, phase suitability, duration ranges, compatibility constraints, and frequency caps.
- Include static reframing, camera motion, aspect adaptation, horror overlays, evidence inserts, and advanced effects.
- Mark treatments as inline-renderable, pre-render-cache-required, or unsupported-for-now.
- Keep catalog deterministic and versioned.

## 5. Tests

- `pnpm test:focused -- packages/domain/src/shot-treatment-catalog.unit.test.ts`

## 6. Acceptance Criteria

- Catalog can answer whether a treatment is valid for aspect ratio, phase, duration, and combination.
- Unsupported advanced effects are represented without being selected by default.

## 7. Risks

- Over-encoding creative policy. Keep renderer feasibility and safety rules explicit.

## 8. Parallelization

Can run in parallel with Tasks 04 and 06 after Task 02.

## 9. Recommended Model

GPT-5.5 Medium, medium reasoning.

## 10. Commit Boundary

Commit treatment catalog and tests only.

