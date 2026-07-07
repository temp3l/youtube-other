# Codex Implementation Prompt — FFmpeg Motion Presets

You are working in an existing TypeScript monorepo for a YouTube/video generation pipeline. Implement the tasks exactly as requested, with production-grade TypeScript, focused tests, and no unrelated changes.

## Global Rules

- Work sequentially in the order listed in this file.
- Do not skip acceptance criteria.
- Do not introduce external API calls.
- Do not regenerate or mutate production episode assets.
- Do not perform broad formatting churn, unrelated refactors, or snapshot updates.
- Prefer small, reviewable commits/diffs.
- Run only focused tests relevant to the current task unless the task explicitly asks for broader verification.
- Stop before starting any task that is explicitly excluded from this batch.
- At the end, report:
  - changed files;
  - tests/commands run;
  - behavior intentionally unchanged;
  - risks or follow-up items.

## Batch

Task 06 only — renderer integration behind disabled-by-default config.

## Recommended Model

GPT-5.5 High / Thinking only

## Batch-Specific Constraints

- Run alone.
- Do not run together with Task 07 or Task 08.
- Preserve disabled behavior byte-for-byte or assertion-equivalent.
- Include motion config/selection/filter summary in fingerprints only when required.
- Preserve final concat, audio mapping, caption burn-in, and validation semantics.

## Included Task

# Task 06 - Renderer Integration

## Goal

Integrate motion rendering into the existing FFmpeg renderer safely.

## Context

The renderer is segment-first. Scene clips are audio-backed, shot clips are silent derived clips cached by fingerprint, and final concat/audio composition should remain unchanged.

## Files to Inspect

- `packages/rendering/src/index.ts`
- `packages/rendering/src/motion/*`
- `packages/shared/src/episode-filesystem.ts`
- `packages/rendering/src/index.unit.test.ts`
- `packages/rendering/src/derived-shot-cache.unit.test.ts`

## Implementation Steps

1. Extend `VideoRenderRequest` with optional `motion?: MotionRenderConfig`.
2. Keep disabled path byte-for-byte or assertion-equivalent to current behavior.
3. Thread motion config into scene clip request building.
4. Add motion selection/filter operations only when enabled.
5. Include motion config, selected preset, seed, and operation summary in render fingerprints.
6. Add additive motion fields to scene and shot clip manifests if needed.
7. Preserve derived-shot cache lookup and invalidation semantics.
8. Preserve final concat, narration audio mapping, caption burn-in, and validation.

## Tests to Add/Update

- `packages/rendering/src/index.unit.test.ts`
- `packages/rendering/src/derived-shot-cache.unit.test.ts`
- `packages/rendering/src/motion/filter-builder.unit.test.ts`

## Acceptance Criteria

- Existing rendering tests still pass.
- Motion disabled render remains unchanged.
- Motion enabled fixture render succeeds.
- Segment duration matches narration/shot duration within existing tolerance.
- Full and short profiles validate expected resolution.

## Rollback Notes

Revert renderer integration while leaving pure motion modules if desired.

## Explicit Constraints

- Do not run in parallel with Task 07 or Task 08.
- Do not alter generated episode assets.
- Do not change final audio composition behavior.

## No Unrelated Changes

Do not refactor remote rendering, concat, or caption burn-in beyond what motion requires.
