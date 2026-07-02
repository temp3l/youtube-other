# Task 04: Pacing And Budget Config

## 1. Objective

Define visual pacing profiles and visual budgets for Shorts and full videos.

## 2. Dependencies

Task 02.

## 3. Likely Files

- `packages/domain/src/index.ts`
- `packages/config/src/index.ts`
- `packages/config/src/index.unit.test.ts`

## 4. Implementation Steps

- Add default profiles: `atmospheric`, `balanced`, `high-retention`, `shorts-aggressive`.
- Add defaults for shot duration, static caps, moving caps, source-image count, shot count, source-image reuse, and effect caps.
- Make defaults configurable without requiring config for existing runs.
- Ensure Shorts defaults account for faster narration WPM.

## 5. Tests

- `pnpm test:focused -- packages/config/src/index.unit.test.ts`
- `pnpm test:focused -- packages/domain/src/shot-plan.unit.test.ts`

## 6. Acceptance Criteria

- Defaults match `production-defaults.md`.
- Existing config loading remains backward compatible.
- No production behavior consumes these defaults until integration tasks.

## 7. Risks

- Too many knobs too early. Keep only fields required by planner and validator.

## 8. Parallelization

Can run in parallel with Tasks 05 and 06 after Task 02.

## 9. Recommended Model

GPT-5.5 Medium, medium reasoning.

## 10. Commit Boundary

Commit config contracts and tests only.

