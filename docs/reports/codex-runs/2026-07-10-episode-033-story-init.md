Summary: Staged the English full story for episode `033-it-always-comes-back` in the canonical authored-script layout so it can be reviewed before any further pipeline work.

Changed paths: `episodes/033-it-always-comes-back/languages/script-en.md`; `docs/reports/codex-runs/2026-07-10-episode-033-story-init.md`

Tests/checks:
- `pnpm mediaforge -- episode dry-run --episode 033-it-always-comes-back --source episodes --language en --artifact full --output-root episodes --json`

Results:
- The parser accepted the draft with no warnings or errors.
- Dry-run reported `wordCount: 1200` and `estimatedDurationSeconds: 400`.

Risks remaining:
- No short, localized, audio, image, render, or upload work has been done yet.
- The current draft is English-only and still needs your review before I generate the rest of the episode.

Commit hash: `24ca8c2`
