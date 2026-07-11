Summary: Cleaned the active full-size shared image set for `025-the-endless-backrooms` so `shared/images/generated/` has one `16x9` PNG per `scene-001` through `scene-065`. Moved 52 stale alternate-timing PNGs to `shared/images/stale-generated-2026-07-10/` and restored the only active `scene-011` PNG expected by the render resolver fallback.

Changed files: `episodes/025-the-endless-backrooms/shared/images/generated/*.png`; `episodes/025-the-endless-backrooms/shared/images/stale-generated-2026-07-10/*.png`; `docs/reports/codex-runs/2026-07-10-025-german-full-image-cleanup.md`.

Tests/checks run: counted active PNGs; checked duplicate scene prefixes; ran `pnpm mediaforge -- render 025-the-endless-backrooms --language de --profile youtube --dry-run`; ran `pnpm mediaforge -- stories render validate --episode 025-the-endless-backrooms --languages de --profiles full --json`; ran `pnpm mediaforge -- stories render --episode 025-the-endless-backrooms --languages de --profiles full --only-ready --json`.

Results: active full image set now has 65 PNGs and zero duplicate scene prefixes. Root render dry-run succeeded but only validates the episode-config English path. `stories render` and `stories render validate` still resolve the workspace root as `./025-the-endless-backrooms` and skip/fail before render input resolution.

Risks remaining: German full still needs a successful localized render command path. German short upload remains blocked by Google OAuth refresh allowlist.

Follow-up tasks: fix or bypass the `stories render` workspace-root resolution for episode `025`, then rerun German full render; resolve OAuth refresh allowlist before retrying German short upload.
