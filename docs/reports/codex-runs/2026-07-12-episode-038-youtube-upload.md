# Episode 038 YouTube Upload

Date: 2026-07-12

Changed files:
- `packages/rendering/src/index.ts`
- `packages/rendering/dist/index.js` (runtime package output, gitignored)
- `episodes/038-the-rain-man/locales/en/full/renders/youtube/final-media-validation.json`
- `episodes/038-the-rain-man/locales/en/full/metadata/youtube-metadata.json`
- `episodes/038-the-rain-man/state/upload/reports/youtube-upload.json`
- `episodes/038-the-rain-man/state/upload/reports/youtube-upload.md`

Tests/checks run:
- `pnpm mediaforge -- render 038-the-rain-man --profile youtube` — passed after fix.
- `pnpm mediaforge -- youtube upload ... --privacy-status private --force` — passed.
- `pnpm --filter @mediaforge/rendering typecheck` — passed.
- `jq` checks for final media validation and upload report — passed.

Results:
- Fixed final render validation to use actual visual concat duration when computing mux duration.
- Uploaded private YouTube video `ctcbVf8bI4c`.

Risks remaining:
- Upload required explicit thumbnail override because `story-production/thumbnail-story.json` is missing.

Follow-up tasks:
- Generate or restore the episode thumbnail contract if the standard upload path should work without overrides.
