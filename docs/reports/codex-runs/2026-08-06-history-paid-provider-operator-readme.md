# History paid-provider README update

Date: 2026-08-06

## Summary

Rewrote `docs/history-channel-paid-providers-readme.md` as an operator runbook
covering plan → review → accept/reject → produce → render → YouTube metadata →
publish, including trusted-script defaults and paid-provider boundaries.

## Changed files

- `docs/history-channel-paid-providers-readme.md`
- `docs/reports/codex-runs/2026-08-06-history-paid-provider-operator-readme.md`

## Checks

- Inspected CLI help for `history`, `history visuals`, `youtube upload`,
  `metadata youtube`, `audio generate`, `images generate`, `render`,
  `thumbnails generate`, and `workflow history`.
- Cross-checked `assertHistoryVisualApproval` (v1 gate for images) and V3.3
  approve production-gate behavior in source.
- No providers, renders, uploads, or automated tests were run (docs-only).

## Risks / follow-up

- Episode IDs must be full imported slugs; short titles will fail.
- V3.3 editorial approve remains blocked until measured audio clears production
  timing; paid image generation still depends on the separate v1 approval file.
