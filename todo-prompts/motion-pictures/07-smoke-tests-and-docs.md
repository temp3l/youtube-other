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

Task 09 only — final smoke verification and operator documentation.

## Recommended Model

GPT-5.5 Medium. Use High if smoke tests fail or FFmpeg behavior needs debugging.

## Batch-Specific Constraints

- Run last.
- Use only local fixture images/audio.
- Do not regenerate production fixtures.
- Do not call external APIs.
- Keep docs focused on motion modes, presets, seed reproducibility, debug reports, and troubleshooting.

## Included Task

# Task 09 - Smoke Tests and Docs

## Goal

Add final smoke verification and operator documentation for FFmpeg motion presets.

## Context

Smoke tests must use local fixture images/audio only and must not modify production episode assets. Documentation should focus on enabling, disabling, seeding, debugging, and safe defaults.

## Files to Inspect

- `packages/rendering/src/index.unit.test.ts`
- `apps/cli/src/index.ts`
- `apps/cli/src/episode-commands.ts`
- `docs/cli-video.md`
- `docs/story-to-video.md`
- `docs/cli-steps.md`

## Implementation Steps

1. Add a smoke render using 3-5 temp fixture images and synthetic audio.
2. Validate output duration and resolution with existing `validateRenderedVideo()` or direct `ffprobe`.
3. Cover full and/or short based on test cost.
4. Document motion modes, preset families, preset IDs, seed reproducibility, debug report path, and troubleshooting.
5. Document that motion is FFmpeg-only and no external APIs are called.
6. Include examples for full videos and shorts.

## Tests to Add/Update

- Focused rendering smoke test file or existing `packages/rendering/src/index.unit.test.ts`.
- CLI help tests if flags were added.

## Acceptance Criteria

- Smoke test passes locally/CI if appropriate.
- Docs explain how to enable/disable motion.
- Docs explain safe defaults and seeds.
- Docs explain how to reproduce a render.

## Rollback Notes

Remove smoke tests and docs. Production code should remain unaffected.

## Explicit Constraints

- Do not regenerate production fixtures.
- Do not call external APIs.
- Do not run broad build/test commands without authorization.

## No Unrelated Changes

Do not update unrelated docs or diagrams.
