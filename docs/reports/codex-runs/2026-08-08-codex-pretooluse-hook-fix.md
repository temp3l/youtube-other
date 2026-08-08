# Codex Run: PreToolUse Hook Fix

## Summary

Updated the repository Codex hook configuration to the supported `hooks`
feature flag and changed allowed `PreToolUse` results from the unsupported
`approve` decision to `allow`.

## Changed Files

- `.codex/config.toml`
- `scripts/codex-command-guard.mjs`
- This report

## Checks

- `bash -n scripts/codex-command-guard.sh` — passed.
- Piped representative `PreToolUse` Bash JSON through the launcher — returned
  `{"decision":"allow"}`.

## Risks And Follow-Up

The Codex host must reload the project configuration before the new feature key
and hook decision take effect. Cursor's separate hook was not changed.
