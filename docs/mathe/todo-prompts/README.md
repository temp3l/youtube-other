Recommended model: GPT-5/Codex  
Recommended reasoning: high

# Mathematics remediation prompt sequence

Execute these prompts in filename order. Do not start a later prompt until the prior
remediation item has been reviewed and accepted. This preserves the strict ordering in
`docs/mathe/audits/remediation-backlog.md`.

The backlog does not permit safely combining separate remediation IDs into one
implementation turn. The prompts instead batch compatible inspection and focused checks
within each item. A-003 and A-004 may stop for human editorial, licensing, or approval
evidence. A-009 should run in a fresh independent Codex session after A-008 is accepted.

1. `01-a001-packaged-cli.md`
2. `02-a002-offline-sympy.md`
3. `03-a003-reviewed-curriculum.md`
4. `04-a004-thumbnail-teacher.md`
5. `05-a005-domain-coverage.md`
6. `06-a006-observability.md`
7. `07-a007-locale-speech.md`
8. `08-a008-release-gates.md`
9. `09-a009-independent-pilot.md`

Every implementation prompt requires a Codex-run report. If work is executed from a file
under `docs/plans/` or `docs/mathe/plans/`, also follow the repository's plan execution
reporting rule before finishing.
