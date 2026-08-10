# Veronica image and speech pipelines

## Changed files

- `packages/strategic-reinvention/src/positioning-production-adapter.ts`, export, and tests
- `packages/image-generation/src/episode-image-pipeline.ts` and Veronica profile test
- `packages/speech/src/creator-voice-policy.ts` and tests
- `apps/cli/src/{veronica-media-commands,images-resume-command,index}.ts` and CLI test
- `packages/rendering/src/index.ts` and affected workspace package exports
- `docs/veronica-benini-channel-paid-providers-readme.md`
- `locales/de/short/scene-plan.json` and derived audio/render artifacts for L01-S01

## Earlier checks

- Focused adapter Vitest: 2 passed after one regex repair.
- Focused speech/image/CLI Vitest: 6 passed after replacing eager CLI imports with nested command delegation.
- `git diff --check`: passed.
- `pnpm --filter @mediaforge/cli typecheck`: blocked by missing built declarations for existing workspace packages; it also exposed existing downstream implicit-any errors.

## Results

`audio reslice-segments --variant short --retime` now writes a locale/variant-local scene plan scaled to existing narration duration and preserves canonical image filename hints. Vertical render consumes that plan. The German short was rerendered at `1080x1920`, 26.411 seconds, H.264 and 48 kHz stereo AAC; no narration or images were regenerated.

## Tests/checks run

- `pnpm --filter @mediaforge/cli build`: passed.
- `pnpm --filter @mediaforge/rendering build`: passed.
- Final `render --profile vertical` validation: passed.
- `ffprobe` final-media inspection: passed (26.411 seconds).

## Risks remaining

The retiming is proportional to original scene duration, not word-level forced alignment. Final clip drift is within 0.021 seconds; use timestamped alignment only if editorial pacing needs further refinement.

## Follow-up

Review the rendered short and, if approved, create localized captions before publishing.
