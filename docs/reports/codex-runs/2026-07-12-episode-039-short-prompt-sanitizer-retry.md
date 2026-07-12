# Episode 039 Short Prompt Sanitizer Retry

Date: 2026-07-12

Summary: Added image-prompt sanitization for malformed or abstract short-scene wording, rebuilt `@mediaforge/image-generation`, and retried EN/DE short production for `039-the-photograph-that-changed`. The retry materially improved moderation outcomes: English dropped from four blocked short scenes to one remaining blocked scene (`scene-009`), while German cleared the prior image-safety blocker and advanced into render assembly.

Changed paths:
- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/image-generation/src/episode-image-pipeline.unit.test.ts`
- `packages/image-generation/dist/`
- `docs/reports/codex-runs/2026-07-12-episode-039-short-prompt-sanitizer-retry.md`

Tests/checks:
- `pnpm exec vitest run -c vitest.unit.config.ts packages/image-generation/src/episode-image-pipeline.unit.test.ts -t "sanitizes abstract memory-erasure phrasing and malformed prompt placeholders"`
- `pnpm --filter @mediaforge/image-generation build`
- `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true MEDIAFORGE_SCRIPT_LANGUAGE=en pnpm mediaforge -- episode short --episode 039-the-photograph-that-changed`
- `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true MEDIAFORGE_SCRIPT_LANGUAGE=de pnpm mediaforge -- episode short --episode 039-the-photograph-that-changed`

Result: EN short still fails image generation on `scene-009` with one remaining OpenAI safety rejection (`req_1df0fda0476a4323a719da0ea7e52553`). DE short cleared the earlier safety blocker and continued through FFmpeg render work. A broader focused unit-file run still exposes an unrelated pre-existing mock-dimension failure in `episode-image-pipeline.unit.test.ts`.

Commit: none.

Unresolved risks: EN short still needs one more prompt adjustment for `scene-009`. DE short render/upload state was still in progress when this report was written.
