# Task 16: Dark Truth Episode Integration

## 1. Objective

Integrate shot planning into the active Dark Truth `episode` full and short workflows.

## 2. Dependencies

Tasks 12 and 13.

## 3. Likely Files

- `apps/cli/src/episode-commands.ts`
- `packages/dark-truth/src/index.ts`
- `apps/cli/src/episode-commands.unit.test.ts`
- `packages/dark-truth/src/index.unit.test.ts`

## 4. Implementation Steps

- After scene plan retiming, image preparation, and audio slicing, create or load shot plans.
- Use `shared/images/generated` for full and `shared/short/images/generated` for Shorts source images.
- Pass shot plan to renderer when enabled.
- Preserve existing review package outputs and sidecar subtitles.
- Add shot validation warnings to generation manifest and review package references.

## 5. Tests

- `pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts`
- `pnpm test:focused -- packages/dark-truth/src/index.unit.test.ts`

## 6. Acceptance Criteria

- Shorts render can produce 15-35 shots from 5-12 source images.
- Existing `episode short --dry-run` and review flows remain compatible.
- No mandatory historical regeneration.

## 7. Risks

- Dark Truth path has ad hoc paths. Prefer shared resolver where feasible and keep compatibility mirrors.

## 8. Parallelization

Coordinate with Task 15. Avoid simultaneous edits to renderer request contracts.

## 9. Recommended Model

GPT-5.5 High may help because this crosses CLI, Dark Truth, image, and render boundaries.

## 10. Commit Boundary

Commit Dark Truth integration only.

