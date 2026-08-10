# Codex hooks feature key update

- Changed files: `.codex/config.toml`, this report.
- Change: renamed deprecated `[features].codex_hooks` to `[features].hooks` while preserving its enabled value.
- Checks: searched for remaining active `codex_hooks` configuration; inspected the updated TOML section.
- Result: no active deprecated configuration remains.
- Risks/follow-up: historical reports retain the old key as an accurate record; no follow-up needed.
