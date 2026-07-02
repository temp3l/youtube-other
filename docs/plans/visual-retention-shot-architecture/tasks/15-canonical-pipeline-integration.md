# Task 15: Canonical Pipeline Integration

## 1. Objective

Integrate shot planning and shot-aware rendering into `packages/pipeline` behind safe defaults.

## 2. Dependencies

Tasks 12 and 13.

## 3. Likely Files

- `packages/pipeline/src/index.ts`
- `packages/pipeline/src/index.unit.test.ts`
- `packages/pipeline/src/index.e2e.test.ts`

## 4. Implementation Steps

- Add a stage between image validation and render-video for shot planning.
- Use existing scene plan, imported/generated images, captions, and render profile.
- Keep existing render path when shot planning is disabled or missing.
- Persist shot plan and validation report through resolver paths.
- Ensure `packageResults` can reference shot artifacts without breaking `EpisodeManifest`.

## 5. Tests

- `pnpm test:focused -- packages/pipeline/src/index.unit.test.ts`
- `pnpm test:focused -- packages/pipeline/src/index.e2e.test.ts`

## 6. Acceptance Criteria

- Existing pipeline run behavior remains available.
- Shot planning can be enabled without provider calls.
- Render output uses multiple shots per image when enabled.

## 7. Risks

- Pipeline stage order changes can affect broad flows. Keep feature gated at first.

## 8. Parallelization

Do not run in parallel with Task 16 unless renderer contracts are frozen.

## 9. Recommended Model

GPT-5.5 High may help due to orchestration risk.

## 10. Commit Boundary

Commit canonical pipeline integration only.

