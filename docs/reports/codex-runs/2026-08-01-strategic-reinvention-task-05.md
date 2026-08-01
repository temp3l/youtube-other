# Strategic Reinvention Task 05

Summary: Added backward-compatible scoped approvals and typed task gate requirements. Approval evaluation rejects partial, empty, malformed, stale, expired, rejected, or revoked scope. High-risk gates require distinct actors. Hosted intents persist immutable `legacy-v1`/`scoped-v1` policy. High-risk/count fields trigger complete-scope validation; legacy authority requires their exact safe defaults plus null scoped evidence. Scoped authority rechecks all evidence.

Changed paths: domain workflow contracts; workflow store/tests; Postgres workflow repository, migration, and tests; CLI approval commands/test/registration.

Tests: workflow-store focused suite (13 passed); persistence approval/publication focused suite (22 passed), final approval repair suite (7 passed); approval CLI focused suite (1 passed); workflow-engine build, persistence typecheck, and `git diff --check` passed.

Commit: `1dbbdf2`.

Unresolved risks: Hosted publication enforcement is SQL-unit-tested but no migration or live database integration test was run. CLI requires initialized local state. No external action is available.
