# Episode 052 Production And YouTube Upload

Summary: Produced episode `052-basement-zero` in EN/DE full and Short formats, repaired ambiguous shared-image aliases by quarantining 13 stale duplicates under `/tmp/episode-052-stale-images`, generated YouTube metadata, and uploaded all four videos privately. Upload IDs: EN full `ieGU6Bekmyg`, EN Short `PhT1LDJeHfM`, DE full `QWzrnAXQ0uU`, DE Short `F2qpG1MdQWI`. Commit: `9ad3882` (worktree not committed).

Changed paths: `episodes/052-basement-zero/**`, including compatibility `manifest.json`, generated media/metadata/upload reports, and German metadata category normalization; `docs/reports/codex-runs/2026-07-12-episode-052-production-and-youtube-upload.md`.

Tests/checks: four source dry-runs; focused episode production commands; filtered builds for visual-planning, dark-truth, and CLI; FFprobe checks confirmed H.264, 1920x1080 full outputs and 1080x1920 Shorts with durations 138.987s, 144.877s, 23.839s, and 23.569s; four successful YouTube API uploads.

Risks: episode validation still reports the pre-existing visual-retention source-identity/validation-schema defect after two targeted repairs. Upload metadata generation is full-scene based, so Short uploads reused full metadata rather than variant-specific metadata. Upload reports retain only the latest target.
