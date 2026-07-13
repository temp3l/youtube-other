## Summary

Created three sample math education videos with paid OpenAI TTS audio. Direct shell `OPENAI_API_KEY` calls still returned `insufficient_quota`; sourcing `.env` supplied the required OpenAI project/org context and succeeded.

## Changed Paths

- `.artifacts/math-sample-videos-paid-audio/audio/`
- `.artifacts/math-sample-videos-paid-audio/linear-equations-paid-preview/final/lesson.mp4`
- `.artifacts/math-sample-videos-paid-audio/scene-coverage-paid-preview/final/lesson.mp4`
- `.artifacts/math-sample-videos-paid-audio/scene-coverage-paid-short/final/lesson.mp4`
- `docs/reports/codex-runs/2026-07-13-sample-math-videos-paid-audio.md`

## Tests / Checks

- OpenAI `/v1/audio/speech` via `.env`: generated 3 MP3 narrations.
- Renderer: 3 successful renders.
- `ffprobe`: all MP4s have H.264 video and AAC audio.
- SHA256: `abbd4212...`, `dbe3f9bf...`, `139b9cf...`.

## Commit Hash

not committed

## Unresolved Risks

Scene-coverage preview audio is longer than the 9s plan and is trimmed by render duration. Direct non-`.env` OpenAI calls still fail quota checks.
