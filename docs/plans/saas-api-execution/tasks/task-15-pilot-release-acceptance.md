# Task 15: Pilot Release Acceptance

## Objective

Make an evidence-backed release decision and advertise only capability cells that
have passed every applicable product, security, operational, and effect-safety gate.

## Depends On

Tasks 00–14. If publication is excluded from the selected pilot, Task 14 may remain
disabled only when the release scope and UI/API capability claims exclude it.

## Scope

- Reconcile the Task 00 matrix with final contract, deployment, and test evidence.
- Verify API/SDK compatibility policy, numeric quotas, SLO/RTO/RPO, retention,
  security ownership, incident response, and customer-support readiness.
- Confirm provider-free acceptance plus authorized provider/publication evidence for
  every advertised cell.
- Run one explicitly authorized bounded release-validation pass using only the
  focused suites named by prior reports.
- Produce release, rollback, known-limitations, and operator checklists.

## Out Of Scope

New features, fixing unrelated broad-suite failures, expanding entitlements, and GA claims.

## Acceptance

- Every advertised cell links to current passing evidence and an owner.
- Failed, expired, or missing evidence keeps the capability disabled/internal.
- Rollback closes new admissions without creating dual writers or blind retries.
- The final decision is `accepted_internal`, `accepted_restricted_pilot`, or `rejected`;
  it is never implied from test count alone.

## Reports

Create the plan implementation report and Codex run report required by the pack README.
