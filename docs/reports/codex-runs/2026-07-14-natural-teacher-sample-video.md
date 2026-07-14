# Natural teacher sample video

Date: 2026-07-14  
Base commit: `b67dd63`

## Changed files

- `.artifacts/math-natural-teacher-first-lesson-2026-07-14/generate-sample.mjs`
- `.artifacts/math-natural-teacher-first-lesson-2026-07-14/sample/**`
- `docs/reports/codex-runs/2026-07-14-natural-teacher-sample-video.md`

## Checks and results

- Speech dry run: passed; 3 semantic chunks, 9 beats, 1 candidate.
- OpenAI-compatible TTS: completed; `gpt-4o-mini-tts`, `cedar`, 91.8 seconds.
- Visual-plan validation: passed for draft 1280x720/24 fps.
- Final render: completed; H.264, AAC, optional `mov_text` subtitles, 92.087 seconds.
- Full FFmpeg decode and FFprobe stream inspection: passed.
- Contact-sheet inspection: board text and equations are legible.

## Risks and follow-up

The production metadata rollout gate does not yet approve `M5-ZO-001`; this preview uses its reviewed lesson-specification fixture without changing that gate. Animated chalk scenes failed in the isolated renderer, so the delivered sample uses stable static board states. Diagnose the chalk-animation backend before requiring progressive writing in production samples.
