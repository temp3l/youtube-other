Summary: Produced episode 050 full + short videos in `en` and `de`, regenerated missing thumbnail inputs/assets, generated YouTube metadata for all four targets, created a root `manifest.json`, and uploaded all variants to YouTube. Upload IDs: `sovsK5SMPdw` (EN full), `gIQvpBmYmHg` (DE full), `PUCwIzHSwZI` (EN short), `8aXpuUT7HKY` (DE short).

Changed paths: `episodes/050-the-voyage-no-one-returned-from/manifest.json`, `episodes/050-the-voyage-no-one-returned-from/story-production/thumbnail-story.json`, `episodes/050-the-voyage-no-one-returned-from/locales/**/metadata/youtube-metadata.json`, `episodes/050-the-voyage-no-one-returned-from/thumbnails/**`, `episodes/050-the-voyage-no-one-returned-from/{en,de}/{full,short}/**`, `docs/reports/codex-runs/2026-07-12-episode-050-production-metadata-upload.md`.

Tests/checks: `pnpm mediaforge -- episode inspect --episode 050 --json`; focused render commands for EN full, DE full, EN short, DE short; metadata generation for EN/DE full via CLI; metadata generation for EN/DE short via targeted Node script; `pnpm mediaforge -- episode review approve` for EN/DE full; four `node apps/cli/bin/mediaforge.js youtube upload ... --privacy-status private --force` runs.

Commit hash: `9ad38824d7d5283ecbc9cdccbf8c45e52fb42df3`

Unresolved risks: upload report files in `state/upload/reports/` are overwritten by the latest upload; image pricing remains unconfigured in execution reports; stale duplicate shared full-image files were moved to `/tmp/050-stale-full-images/` rather than deleted.
