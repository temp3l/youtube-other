# Math curriculum release remediation

Date: 2026-07-12  
Backlog item: `docs/mathe/audits/remediation-backlog.md` R-003  
Commit: `ac21261` (working tree uncommitted)

## Summary

Added hash-bound normalized release loading, strict source/override/migration
validation, 19 conservative reviewed prerequisite edges, stable cycle and
disconnected diagnostics, and read-only CLI import validation. Registered all
official jurisdictions named by the methodology. All 206 skill mappings and
state overrides remain explicitly incomplete, so the draft is production-blocked.

## Changed paths

- `packages/math-education/{src,data}/curriculum/`
- `packages/math-education/src/{domain,orchestration}/`
- `apps/cli/src/math-commands*`
- Mathematics audits and plan/run reports

## Tests/checks

- Release tests: 5 passed.
- DAG, CLI, and pipeline: 9 passed after one stale-dist test repair.
- CLI dry-run exact test: passed with zero file change.
- Math-education and CLI typechecks: passed.
- Targeted Prettier and `git diff --check`: passed.

## Risks/follow-up

R-003 was independently accepted after 11 focused curriculum tests, the exact
read-only CLI test, and math/CLI typechecks passed. Full editorial provenance
and DAG coverage remain incomplete by design. The legacy NRW PDF URL currently
redirects; add the current landing page before review. No provider or publish
action ran.
