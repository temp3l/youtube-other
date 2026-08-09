# YSAAS-009 bulk preflight foundation

Implementation commits: `9236fa2`, `3188f69`, `0e50124`, `5b8358a`, `6f88755`, `6a5bd38`, `3475923`, `ba5db9e`, `2134144`, `4140d7a`

Changed paths: bulk preflight domain, persistence batch/item repository and tests, durable-job repository, API/OpenAPI/SDK, plan ledger, and implementation report.

Checks: focused domain preflight (2), persistence batch tests (3), and API SDK (13); domain build; persistence/API/SDK typechecks — passed. The API contract suite was blocked before collection by a pre-existing built `dark-truth` dependency-resolution error.

Risks/follow-up: terminal child state settles atomically with fenced durable-job mutation and releases that batch's reserved capacity. Retry and child-cancellation fan-out are unimplemented. BFF remains unimplemented.
