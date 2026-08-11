# OpenAI Batch submission safety

## Changed files

- Shared Batch request-set identity and tests.
- Story Batch intent, reconciliation, lifecycle wiring, tests, and schemas.
- Image Batch intent/reconciliation wiring, retry lineage, tests, and schemas.
- OpenAI call characterization, remediation plan, and implementation report.

## Tests/checks and results

- Shared paid-request tests: 12 passed.
- Batch reconciliation tests: 3 passed.
- New Story ambiguous-recovery and concurrent-submitter tests: passed.
- Story build: passed.
- Story integration remains blocked by a stale 3-item fixture expectation.
- Image typecheck remains blocked by pre-existing prompt-cache schema and
  unrelated Veronica QA config typing; task-local status errors were corrected.
- Paid OpenAI calls: 0.

## Risks and follow-up

- The filesystem guarantee requires a shared canonical Batch storage root.
- Zero, incomplete, duplicate, and failed provider-list results remain blocked.
- Orphan uploaded files are not automatically cleaned up.
- Repair the stale fixtures/type drift, then rerun the full Image Batch unit file.
