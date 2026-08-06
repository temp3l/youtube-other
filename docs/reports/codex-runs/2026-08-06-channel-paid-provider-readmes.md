# Channel paid-provider READMEs

Changed files:

- `docs/darktruth-channel-paid-providers-readme.md`
- `docs/math-channel-paid-providers-readme.md`
- `docs/veronica-benini-channel-paid-providers-readme.md`
- `docs/reports/codex-runs/2026-08-06-channel-paid-provider-readmes.md`

Summary: documented the current command sequences and fail-closed limits for
Dark Truth, Mathematics, and Veronica Benini. Math is limited to private paid
generation plus publish dry-run; Veronica has no supported paid production or
publishing workflow.

Checks: source/docs inspection and `git diff --check`; no providers, renders,
uploads, or automated tests were run.

Commit hash at inspection: `b052575`.

Risks: commands depend on local credentials, provider quotas, valid source
packs, and human approval; these were not exercised.
