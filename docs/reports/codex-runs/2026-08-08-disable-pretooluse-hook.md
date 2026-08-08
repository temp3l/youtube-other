# Disable PreToolUse Hook

## Summary

Disabled the repository's Bash `PreToolUse` command guard registration.

## Changed Paths

- `.codex/hooks.json`

## Tests

- `node -e 'JSON.parse(require("node:fs").readFileSync(".codex/hooks.json", "utf8"))'`

## Result

Passed; the hooks configuration is valid JSON and has no `PreToolUse` entry.

## Commit Hash

Not committed.

## Unresolved Risks

The verification-command guard is no longer enforced by Codex hooks in this repository.
