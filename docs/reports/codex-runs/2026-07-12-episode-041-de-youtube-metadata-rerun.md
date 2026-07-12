Summary: Corrected the `metadata youtube` input for episode 041 German full metadata by rerunning against `shared/scenes.json` instead of the localized `de/full/scenes.json`. Metadata generation succeeded and wrote the localized YouTube metadata output.
Changed paths: `episodes/041-the-town-that-calls-your-name/locales/de/full/metadata/youtube-metadata.json`, `docs/reports/codex-runs/2026-07-12-episode-041-de-youtube-metadata-rerun.md`
Tests: `YOUTUBE_METADATA_LANGUAGE=de pnpm mediaforge -- metadata youtube episodes/041-the-town-that-calls-your-name/shared/scenes.json --force`
Commit hash: `8cc3876005780900b705d35158d17cbb9847175e`
Unresolved risks: The CLI telemetry labels the execution `episodeId` as `shared` for this command path; output succeeded, but the labeling may be confusing in logs. No upload step was run or verified.
