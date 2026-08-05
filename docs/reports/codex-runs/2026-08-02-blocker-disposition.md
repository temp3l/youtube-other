# Blocker disposition

## Summary

Recorded the operator decisions that resolve current scope ambiguity: Math is
German-only and publication is manually initiated from the CLI. Classified all
other previously reported blockers as deferred, code-repair required, or
intentionally fail-closed; no implementation was performed.

## Changed files

- `docs/decisions/ADR-OPERATIONS-001-current-scope-and-publication-authority.md`
- `docs/decisions/README.md`
- this report

## Tests/checks run

- Reviewed the relevant decision register, Math remediation backlog, API
  publication plan, and current status reports.
- Documentation paths exist and `git diff --check` passed.

## Results

Scope and operational-authority blockers are resolved. External-evidence and
code-defect blockers remain explicitly fail-closed or deferred.

## Risks remaining

The Italian lineage failure needs a source repair and focused test. Live
publication still requires its existing approval, credential, channel, and
reconciliation evidence.

## Follow-up tasks

Implement the deferred work only under a separate authorized task, starting
with the Italian lineage repair if Strategic Task 08 is resumed.
