# L01 localized video renders

Date: 2026-08-10

## Summary

Re-rendered the German vertical short and created the English vertical short using the refreshed shared canonical images. English scene timing was retimed to the assembled narration duration before rendering.

## Changed paths

- `episodes/l01-s01-being-good-isnt-enough/locales/de/short/renders/`
- `episodes/l01-s01-being-good-isnt-enough/locales/en/short/`
- `episodes/l01-s01-being-good-isnt-enough/shared/semantic-image-prompt-*.json`
- `episodes/l01-s01-being-good-isnt-enough/shared/scenes.json`

## Checks

- FFmpeg render validation passed: German 1080x1920 H.264/AAC, 26.411s; English 1080x1920 H.264/AAC, 30.336s.
- English timing retime and scene-audio slicing passed.
- No images were generated.

## Risk / follow-up

Italian was not rendered. The canonical narration contract rejects `it` (allowed locales: `en`, `de`, `es`, `fr`, `pt`) before provider output. Extending it requires an approved locale-contract change and targeted validation.
