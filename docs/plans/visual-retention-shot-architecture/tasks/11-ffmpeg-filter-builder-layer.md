# Task 11: FFmpeg Filter Builder Layer

## 1. Objective

Introduce typed FFmpeg filter builders for local shot treatments.

## 2. Dependencies

Task 05.

## 3. Likely Files

- `packages/rendering/src/index.ts`
- New `packages/rendering/src/filter-builders.ts`
- `packages/rendering/src/index.unit.test.ts`

## 4. Implementation Steps

- Add typed operations for scale, crop, zoompan, overlay, boxblur, eq, noise, vignette, fade, drawtext, xfade, setpts, rotate, and format.
- Preserve current `buildSceneClipFilterGraph` behavior through compatibility wrappers.
- Escape paths and drawtext safely.
- Add tests for syntax, dimensions, aspect ratio, and deterministic output args.

## 5. Tests

- `pnpm test:focused -- packages/rendering/src/index.unit.test.ts`
- `pnpm test:focused -- packages/rendering/src/filter-builders.unit.test.ts`

## 6. Acceptance Criteria

- Existing scene clip render requests produce equivalent args unless shot rendering is explicitly used.
- Filter builders are reusable by preview and final render paths.

## 7. Risks

- FFmpeg expressions are easy to break. Keep builders small and snapshot only concise args.

## 8. Parallelization

Can run in parallel with Task 07 after treatment IDs are stable.

## 9. Recommended Model

GPT-5.5 Medium. GPT-5.5 High may help for complex xfade/zoompan graph design.

## 10. Commit Boundary

Commit renderer filter-builder layer and tests only.

