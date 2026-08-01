# Speech completion prompt run

Date: 2026-08-01

Changed files:

- `docs/plans/provider-neutral-speech-generation-completion-prompt.md`
- `docs/reports/codex-runs/2026-08-01-speech-completion-prompt.md`

Checks run:

- Read the existing speech implementation report and known-limitations document.
- `git diff --check` after creation.

Result: created a fresh-session prompt centered on production composition, legacy-path
removal, durable PostgreSQL behavior, entry-point integration, audio/provider hardening,
observability, focused verification, documentation reconciliation, and explicit completion
gates.

Risks remaining: the prompt describes future implementation work and does not itself
resolve the current production blockers.

Commit: not committed; base `a30e981`.
