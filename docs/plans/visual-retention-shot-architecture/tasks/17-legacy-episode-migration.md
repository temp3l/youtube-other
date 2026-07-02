# Task 17: Legacy Episode Migration

## 1. Objective

Support existing episodes that have scene images and scene timing but no focal metadata or shot plan.

## 2. Dependencies

Tasks 06, 07, 08, and 13.

## 3. Likely Files

- `packages/visual-planning/src/*`
- `apps/cli/src/index.ts`
- `apps/cli/src/*.unit.test.ts`

## 4. Implementation Steps

- Add local migration planner that reads existing scene plans and image manifests.
- Infer conservative crops and focal regions.
- Use safe push-ins/pans and blurred fill when vertical crop is unsafe.
- Disable aggressive parallax and high-risk close-ups.
- Emit preview and validation report.
- Regenerate source images only when validation proves no safe composition exists.

## 5. Tests

- `pnpm test:focused -- packages/visual-planning/src/legacy-shot-plan.unit.test.ts`
- `pnpm test:focused -- apps/cli/src/index.unit.test.ts`

## 6. Acceptance Criteria

- Legacy assets get valid safe shot plans without image regeneration.
- Missing or low-resolution images produce actionable validation errors.

## 7. Risks

- Old manifests have multiple shapes. Support canonical and known legacy image paths.

## 8. Parallelization

Can run in parallel with Task 14 after Task 13.

## 9. Recommended Model

GPT-5.5 Medium, medium reasoning.

## 10. Commit Boundary

Commit migration support and tests only.

