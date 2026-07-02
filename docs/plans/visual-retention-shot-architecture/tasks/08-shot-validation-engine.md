# Task 08: Shot Validation Engine

## 1. Objective

Add local validators for pacing, static duration, source-image reuse, crop similarity, treatment repetition, opening variety, climax pace, evidence provenance, and caption/evidence safety.

## 2. Dependencies

Tasks 04, 05, and 07.

## 3. Likely Files

- `packages/visual-planning/src/validators.ts`
- `packages/visual-planning/src/*.unit.test.ts`

## 4. Implementation Steps

- Implement validation codes from `validation-plan.md`.
- Calculate crop overlap and adjacent shot similarity from metadata.
- Validate opening and climax cadence by profile.
- Validate treatment frequency caps.
- Emit structured warnings/errors with owning shot IDs.
- Provide deterministic local repair suggestions without mutating plans.

## 5. Tests

- `pnpm test:focused -- packages/visual-planning/src/shot-validation.unit.test.ts`

## 6. Acceptance Criteria

- Failing fixtures cover 11s, 13s, and 20s static/unchanged-image cases.
- Passing fixtures cover compliant Shorts and full-video profiles.
- Validators require no live provider calls.

## 7. Risks

- Validators may block acceptable atmospheric moments. Allow longer moving atmospheric shots only under full-video profiles.

## 8. Parallelization

Serial after Task 07.

## 9. Recommended Model

GPT-5.5 Medium, medium reasoning.

## 10. Commit Boundary

Commit validators and fixtures only.

