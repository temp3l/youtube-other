# R-008 implementation prompt handoff

- Summary: added the recommended next prompt for implementing R-008 fail-closed quality derivation, versioned approvals, render/publish permissions, authoritative CLI status loading, and exit codes 0/1/2/3. The handoff preserves accepted R-007, limits work to R-008, requires focused tests/typechecks, and leaves R-009 unstarted.
- Changed paths: `todo-prompts/math-followups/09-implement-r008-fail-closed-quality-cli.md`; this report.
- Checks: `git diff --check` and report word-count validation.
- Commit: `1bd66d4e302ac8795110b6606d3249c373a89095`; baseline `ac21261`; uncommitted.
- Risks: the prompt was not executed; no production code, tests, fixtures, generated/dist assets, provider/network path, render, publish action, or commit was run.
