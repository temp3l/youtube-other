Summary: Completed `025-the-endless-backrooms` YouTube uploads for `en/full` and `en/short`. Added a minimal episode manifest plus upload metadata for `en/short`, `de/full`, and `de/short`; generated the `en/full` thumbnail/story upload path; moved two stale shared image duplicates out of the active render set.

Changed paths: `episodes/025-the-endless-backrooms/manifest.json`, `episodes/025-the-endless-backrooms/story-production/thumbnail-story.json`, `episodes/025-the-endless-backrooms/locales/en/short/metadata/youtube-metadata.json`, `episodes/025-the-endless-backrooms/locales/de/full/metadata/youtube-metadata.json`, `episodes/025-the-endless-backrooms/locales/de/short/metadata/youtube-metadata.json`, `episodes/025-the-endless-backrooms/state/uploads/reports/en-full/*`, `episodes/025-the-endless-backrooms/state/uploads/reports/en-short/*`, `episodes/025-the-endless-backrooms/shared/images/generated/scene-012__000066-000071__16x9.png`, `episodes/025-the-endless-backrooms/shared/images/generated/scene-013__000071-000078__16x9.png`.

Tests/checks: `youtube upload` for `en/full` and `en/short` succeeded; `render --language de --profile youtube` failed on stale image ambiguities at `scene-012`, `scene-013`, and `scene-014`; `youtube upload` for `de/short` failed on Google OAuth token refresh allowlist.

Commit hash: not committed.

Unresolved risks: `de/full` remains unrendered, so its upload is blocked until the remaining ambiguous shared images are cleaned up or the render path is repaired; `de/short` upload needs OAuth refresh access outside the current allowlist/proxy path.
