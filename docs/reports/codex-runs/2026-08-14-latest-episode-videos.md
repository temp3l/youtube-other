# Latest episode videos

Date: 2026-08-14

Summary: Replaced the copied episode trees in `episodes/latest-episodes/` with the 11 completed final Veronica MP4 files from `episodes/veronica-all/`.

Changed files:

- `episodes/latest-episodes/*.mp4` — 11 final-video copies only
- `docs/reports/codex-runs/2026-08-14-latest-episode-videos.md`

Tests/checks: Verified the destination has 11 files, every file has an `.mp4` extension, and Git ignores the directory through the existing `episodes` rule.

Results: The destination is a flat, MP4-only folder and will not be included in Git status or commits unless forced.

Commit: None; no commit was created.

Risks remaining: The folder is a manual snapshot; refresh it after new final videos are produced.

Follow-up tasks: None.
