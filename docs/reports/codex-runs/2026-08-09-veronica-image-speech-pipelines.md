# Veronica image and speech pipelines

## Changed files

- `packages/strategic-reinvention/src/positioning-production-adapter.ts`, export, and tests
- `packages/image-generation/src/episode-image-pipeline.ts` and Veronica profile test
- `packages/speech/src/creator-voice-policy.ts` and tests
- `apps/cli/src/{veronica-media-commands,images-resume-command,index}.ts` and CLI test
- `packages/rendering/src/index.ts` and affected workspace package exports
- `docs/veronica-benini-channel-paid-providers-readme.md`

## Earlier checks

- Focused adapter Vitest: 2 passed after one regex repair.
- Focused speech/image/CLI Vitest: 6 passed after replacing eager CLI imports with nested command delegation.
- `git diff --check`: passed.
- `pnpm --filter @mediaforge/cli typecheck`: blocked by missing built declarations for existing workspace packages; it also exposed existing downstream implicit-any errors.

## Results

The German vertical short rendered successfully at `1080x1920`, 26.634 seconds, H.264 video and 48 kHz stereo AAC. It uses the existing `shimmer` narration and five generated images; neither was regenerated. Scene slices were rebuilt from the existing WAV after the original 40.8-second plan yielded an empty final slice.

## Tests/checks run

- `pnpm --filter @mediaforge/cli build`: passed.
- `pnpm --filter @mediaforge/rendering build`: passed.
- Final `render --profile vertical` validation: passed.
- `ffprobe` final-media inspection: passed.

## Risks remaining

The visual timeline retains the source plan's 40.8-second scene pacing while continuous German narration is 26.434 seconds; final mux duration is therefore narration-led (26.634 seconds). Regenerate the localized timing plan before a future render if exact scene-to-speech pacing is required.

## Follow-up

Review the rendered short and, if approved, create localized captions before publishing.
