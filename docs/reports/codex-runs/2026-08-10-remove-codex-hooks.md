# Remove Codex Hooks

## Changed files

- Removed `.codex/hooks.json`.
- Removed `scripts/codex-command-guard.mjs` and `scripts/codex-command-guard.sh`.
- Removed the `codex_hooks` feature flag from `.codex/config.toml`.
- Updated `docs/development/codex-verification-guardrails.md` to describe instruction-based Codex guardrails and the retained Cursor hook.
- Added this run report.

## Tests and checks

- Verified the removed files no longer exist.
- Searched active configuration, scripts, and development documentation for remaining Codex hook references.

## Results

- Repository-local Codex hooks are removed; Cursor hooks remain configured.

## Risks remaining

- Generated and historical documentation may retain references to the former hook until its normal regeneration or archival workflow runs.

## Follow-up tasks

- Regenerate the AI context pack when its generated documentation is next refreshed.
