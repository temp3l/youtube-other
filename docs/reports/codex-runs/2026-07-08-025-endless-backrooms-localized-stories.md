Summary: Generated paid-provider English and German full-story outputs for episode `025-the-endless-backrooms` with `pnpm mediaforge -- stories rewrite-full ...`. The first run against `content-ideas/content/dark-truth-episodes-optimized/025-the-endless-backrooms-en-full-optimized.md` failed local validation (`Full contains editorial commentary.`), so a cleaned episode-local input was created from that source and the second provider-backed run succeeded.

Changed paths: `episodes/025-the-endless-backrooms/en/full/script.md`, `episodes/025-the-endless-backrooms/en/full/canonical-full.json`, `episodes/025-the-endless-backrooms/en/full/generation-manifest.json`, `episodes/025-the-endless-backrooms/de/full/script.md`, `episodes/025-the-endless-backrooms/script.md`, `episodes/025-the-endless-backrooms/languages/script-en.md`, `episodes/025-the-endless-backrooms/languages/script-de.md`, `episodes/025-the-endless-backrooms/source/*`, `docs/reports/codex-runs/2026-07-08-025-endless-backrooms-localized-stories.md`.

Tests/checks: `stories rewrite-full --dry-run --json`; failed paid run on original optimized input; successful paid run on `episodes/025-the-endless-backrooms/source/025-the-endless-backrooms-en-full-cli-input.md`; `git diff --check -- episodes/025-the-endless-backrooms docs/reports/codex-runs`.

Commit hash: `00c1369`

Unresolved risks: German output contains some awkward spacing/word-choice artifacts from generation and may need editorial QA before downstream metadata/audio work.
