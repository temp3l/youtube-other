# Real-TTS active-practice pilot

Date: 2026-07-24

## Changed files

- `apps/cli/src/math-commands.ts`
- `apps/cli/src/math-workflow-runtime.ts`
- `apps/cli/src/math-workflow-runtime.unit.test.ts`
- `packages/math-education/src/lesson/variant-builder.ts`
- `packages/math-education/src/lesson/lesson-variant.unit.test.ts`
- `packages/math-education/src/orchestration/canonical-task-adapters.ts`
- `packages/math-education/src/orchestration/math-pipeline.unit.test.ts`
- `packages/math-rendering/src/quality/media-qa.ts`
- `.cache/math-pipeline/m5-zo-001-real-tts-pilot/`

## Result

Created a private five-minute M5-ZO-001 pilot at 105.4 spoken WPM. It preserves
the misconception check, different-pattern independent example, 8.165-second
thinking pause, and fact-free retrieval with a 6.683-second final hold.
Provider usage was 9 calls, 0 retries, and USD 0.089443 estimated.

## Checks

Runtime tests: 10 passed. Lesson-variant tests: 5 passed. Media validation,
continuity, corruption, loudness, peak, clipping, and visual checks passed.
One synthetic pipeline test is blocked by a stale curriculum fixture. Clean
math builds later became blocked by unrelated story-localization type errors;
local dist was patched to finish review.

## Risks and follow-up

Human listening approval is required. The canonical operator is blocked by the
stale private-owner content attestation. Do not roll out or publish until both
are resolved.
