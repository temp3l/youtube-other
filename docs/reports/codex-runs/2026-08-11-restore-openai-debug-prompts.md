# Restore OpenAI debug prompts

## Summary

Added a provenance-safe restoration utility and generated adjacent restored copies for `l01-s01-being-good-isnt-enough`. It restored 10 records representing 5 paid calls by matching persisted prompt hashes, scene IDs, and OpenAI request IDs. Original debug logs were not modified; secrets and base64 image outputs remain redacted.

## Changed paths

- `scripts/restore-openai-debug-prompts.mjs`
- `episodes/l01-s01-being-good-isnt-enough/debug/openai-calls-restored/` (generated, ignored)
- `docs/reports/codex-runs/2026-08-11-restore-openai-debug-prompts.md`

## Tests/checks

- `node --check scripts/restore-openai-debug-prompts.mjs` — passed.
- Ran restoration against the episode — 38 records, 19 paid calls, 5 exact paid-call prompts restored.
- Confirmed original logs still contain no unredacted prompt text.

## Commit hash

`c4e786f742a75489bb1a725fa7fc07d50328d167`

## Unresolved risks

Fourteen older paid-call prompts cannot be restored exactly because their prompt snapshots were overwritten; only hashes remain. Do not substitute current scene prompts for those historical calls.
