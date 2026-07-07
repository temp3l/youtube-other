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

Task 08 only — motion debug report.

## Recommended Model

GPT-5.5 Medium or High

## Batch-Specific Constraints

- Run after Task 06, preferably after Task 07.
- Do not run together with Task 06.
- Write reports only when debug is enabled.
- Do not log secrets, full noisy FFmpeg commands, or unnecessary external paths.

## Included Task

# Task 08 - Debug Reporting

## Goal

Add motion debug/report output for selected presets and generated segments.

## Context

Reports should help diagnose deterministic selection, FFmpeg filter choices, cache reuse, and failed segments without making normal logs noisy.

## Files to Inspect

- `packages/rendering/src/index.ts`
- `packages/rendering/src/motion/report.ts` if created
- `packages/shared/src/episode-filesystem.ts`
- `packages/rendering/src/index.unit.test.ts`

## Implementation Steps

1. Define `MotionRenderReport` and `MotionRenderReportShot` types.
2. Record selected preset, family, intensity, duration, input image, output segment, seed, reason, and filter summary per shot/scene.
3. Write report only when `motion.debug === true`.
4. Save report to render output directory, preferably `<outputDir>/motion-report.json`.
5. Include failure context when segment rendering fails.
6. Keep logs concise and avoid printing full FFmpeg commands by default.

## Tests to Add/Update

- `packages/rendering/src/index.unit.test.ts`
- New `packages/rendering/src/motion/report.unit.test.ts` if report helpers are separate.

## Acceptance Criteria

- Report is written when debug enabled.
- Report is absent when debug disabled.
- Report follows existing output path conventions.
- Report is useful for retry/debug without mutating source manifests.

## Rollback Notes

Remove report writer and report fields. Rendering should still work if motion remains enabled.

## Explicit Constraints

- Do not run in parallel with Task 06.
- Do not write reports into generated image/audio directories.
- Do not log secrets or external paths unnecessarily.

## No Unrelated Changes

Do not change render validation or cache behavior except to include report references if needed.
