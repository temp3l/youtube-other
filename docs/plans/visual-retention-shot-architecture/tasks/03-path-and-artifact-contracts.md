# Task 03: Path And Artifact Contracts

## 1. Objective

Add resolver-owned paths and manifest store contracts for shot plans, focal metadata, previews, validation reports, and derived clips.

## 2. Dependencies

Task 02.

## 3. Likely Files

- `packages/shared/src/episode-filesystem.ts`
- `packages/shared/src/episode-filesystem.unit.test.ts`

## 4. Implementation Steps

- Add path helpers under `state/visual-retention` for source scenes, focal metadata, shot plans, validation reports, storyboards, and contact sheets.
- Add path helpers under `state/render/derived-shots` for content-addressed derived clips and manifests.
- Add unit tests proving paths are inside the episode workspace and stable across locales/variants.
- Do not migrate existing artifacts yet.

## 5. Tests

- `pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts`

## 6. Acceptance Criteria

- All new paths are resolver-owned.
- No new ad hoc path policy is introduced in CLI or renderer code.
- Existing path tests still pass.

## 7. Risks

- Path naming drift between canonical pipeline and Dark Truth. Prefer resolver helpers everywhere.

## 8. Parallelization

Serial after Task 02.

## 9. Recommended Model

GPT-5.5 Medium, medium reasoning.

## 10. Commit Boundary

Commit shared path additions and tests only.

