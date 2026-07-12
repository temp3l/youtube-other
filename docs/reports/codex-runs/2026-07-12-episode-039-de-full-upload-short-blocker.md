# Episode 039 DE Full Upload And Short Blocker

Date: 2026-07-12

Summary: Generated German full narration from `languages/script-de.md`, rendered a static no-motion full video from approved still images, generated German YouTube metadata, and uploaded the German full video as private. English full was already uploaded private in the previous run. Short video production was attempted but blocked by OpenAI TTS rate limiting.

Changed paths:
- `episodes/039-the-photograph-that-changed/locales/de/full/audio/`
- `episodes/039-the-photograph-that-changed/locales/de/full/video/039-the-photograph-that-changed-de-full.mp4`
- `episodes/039-the-photograph-that-changed/locales/de/full/metadata/youtube-metadata.json`
- `episodes/039-the-photograph-that-changed/locales/en/short/audio/narration-text.txt`
- `episodes/039-the-photograph-that-changed/locales/de/short/audio/narration-text.txt`

Tests/checks:
- `ffprobe` DE full: H.264 1920x1080 plus AAC audio, 381.360 seconds.
- `MEDIAFORGE_SCRIPT_LANGUAGE=de pnpm mediaforge -- metadata youtube --episode 039-the-photograph-that-changed --force`
- `MEDIAFORGE_SCRIPT_LANGUAGE=de pnpm mediaforge -- --json youtube upload ... --privacy-status private`

Result: Uploaded private YouTube video `NQS6RaADQPI`. EN full private video remains `1z8uchn3TLs`.

Commit: none.

Unresolved risks: EN/DE shorts are not uploaded; two direct short TTS attempts returned HTTP 429.
