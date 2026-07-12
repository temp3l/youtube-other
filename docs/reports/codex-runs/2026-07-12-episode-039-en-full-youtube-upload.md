# Episode 039 EN Full YouTube Upload

Date: 2026-07-12

Summary: Repaired the interrupted English full render by restoring the corrupt scene clip, rebuilt the final static-image video, generated English YouTube metadata, created a static 1280x720 thumbnail, and uploaded the English full video to YouTube as private. Motion effects were not used.

Changed paths:
- `episodes/039-the-photograph-that-changed/en/full/video/039-the-photograph-that-changed-en-full.mp4`
- `episodes/039-the-photograph-that-changed/en/full/thumbnails/youtube-thumbnail.jpg`
- `episodes/039-the-photograph-that-changed/locales/en/full/metadata/youtube-metadata.json`
- `episodes/039-the-photograph-that-changed/state/upload/reports/youtube-upload.json`
- `episodes/039-the-photograph-that-changed/state/upload/reports/youtube-upload.md`

Tests/checks:
- `ffprobe` final video: H.264 1920x1080 plus AAC audio, 378.523 seconds.
- `pnpm mediaforge -- metadata youtube --episode 039-the-photograph-that-changed --force`
- `pnpm mediaforge -- --json youtube upload ... --privacy-status private`

Result: Uploaded private YouTube video `1z8uchn3TLs`.

Commit: none.

Unresolved risks: German full, English short, and German short videos are not yet generated or uploaded. Upload retry showed `--generate-metadata` did not work inline in the packaged upload path, so metadata was generated separately.
