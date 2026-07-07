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

Task 01 only — characterization tests before implementation.

## Recommended Model

GPT-5.5 High / Thinking

## Batch-Specific Constraints

- Do not implement the motion preset system.
- Do not change runtime renderer behavior.
- This batch exists to protect later implementation work.

## Included Task

# Task 01 - Characterization Tests

## Goal

Add focused tests that pin current rendering behavior before motion preset implementation.

## Context

The renderer already supports scene clips, shot clips, `zoompan` from `RenderShot.motion`, derived-shot caching, final concat, and narration audio alignment. These tests must pass before any production motion code is added.

## Files to Inspect

- `packages/rendering/src/index.ts`
- `packages/rendering/src/index.unit.test.ts`
- `packages/rendering/src/filter-builders.unit.test.ts`
- `packages/rendering/src/derived-shot-cache.unit.test.ts`
- `apps/cli/src/index.ts`
- `apps/cli/src/episode-commands.ts`

## Implementation Steps

1. Add or extend tests proving `buildSceneClipFilterGraph()` current output for 16:9 and 9:16.
2. Add or extend tests proving motion-disabled future config, if introduced in this task, preserves the current filter string.
3. Add a render fixture test for full scene rendering with local generated image and synthetic audio only.
4. Add a render fixture test for short/vertical rendering with local generated image and synthetic audio only.
5. Add assertions that current shot-plan `RenderShot.motion` generates `zoompan` and affects render-operation fingerprint.

## Tests to Add/Update

- `packages/rendering/src/index.unit.test.ts`
- `packages/rendering/src/filter-builders.unit.test.ts`

## Acceptance Criteria

- Tests pass before production motion implementation.
- No renderer behavior changes.
- Fixture output is under temp directories only.
- No external APIs or generated production assets are touched.

## Rollback Notes

Revert only the tests from this task. No production code should depend on them yet.

## Explicit Constraints

- Do not implement the motion preset system.
- Do not weaken existing assertions.
- Do not update snapshots broadly.
- Do not run repository-wide tests.

## No Unrelated Changes

Make no unrelated refactors, formatting churn, CLI changes, or documentation edits.
