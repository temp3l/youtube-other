# Task 12: Shot-Aware Renderer Integration

## 1. Objective

Render `RenderShot` timelines while preserving existing scene-clip rendering as a fallback.

## 2. Dependencies

Tasks 07, 08, and 11.

## 3. Likely Files

- `packages/rendering/src/index.ts`
- `packages/rendering/src/*.unit.test.ts`
- `packages/domain/src/index.ts`

## 4. Implementation Steps

- Add optional `shotPlan` to render request or a new shot-render request type.
- Render shot clips with deterministic shot IDs.
- Update clip ID safety checks to allow the selected shot ID pattern.
- Write shot clip manifests with source image hash, shot fingerprint, render operation fingerprint, output hash, and renderer.
- Concatenate shot clips in shot timeline order.
- Keep one-scene-one-clip render path unchanged unless a shot plan is supplied.

## 5. Tests

- `pnpm test:focused -- packages/rendering/src/index.unit.test.ts`
- Add tests for one source image producing multiple shot clip requests.

## 6. Acceptance Criteria

- Existing render tests pass.
- Shot-aware render validates dimensions and duration.
- Changing crop/motion changes shot fingerprint but not source-image dependency.

## 7. Risks

- Renderer contract changes may affect remote rendering. Keep `ClipRenderRequest` compatible and map shot inputs like current scene clips.

## 8. Parallelization

Serial. Coordinate with cache and pipeline integration tasks.

## 9. Recommended Model

GPT-5.5 High may be useful. Medium is acceptable if filter builders are already stable.

## 10. Commit Boundary

Commit shot-aware renderer integration and tests only.

