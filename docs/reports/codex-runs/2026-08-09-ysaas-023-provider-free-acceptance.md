# YSAAS-023 provider-free acceptance

Summary: The deterministic provider-free executor seam runs after correcting the unit-test domain-subpath alias. A full tenant-to-BFF acceptance fixture is still absent; a web-owned candidate was removed rather than retaining an un-runnable test.

Changed paths: acceptance reporting only; no unvalidated fixture was retained.

Checks: provider-free executor unit test passed (5). Focused disposable-Postgres workflow integration passed (8): RLS isolation, stale transition rejection, leased/fenced durable jobs, and retry lifecycle. Two focused candidate BFF runs stopped in collection: first could not resolve `pg` from `apps/web`, then could not resolve `@mediaforge/persistence`; no assertions ran.

Commit: `bbacc3a`.

Risks: No accepted evidence for quota, stale review, webhook replay, quarantine, leakage, or one API/BFF journey. Add an isolated seeded Postgres+BFF fixture in the API integration package, or deliberately configure the web integration resolver, before certifying YSAAS-023.
