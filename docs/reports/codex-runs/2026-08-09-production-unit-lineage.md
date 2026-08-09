# Production-unit lineage foundation

Summary: added tenant-isolated, append-only production-unit snapshot persistence with a database worker-identity guard. Reads and metadata-only comparisons now flow through API, SDK, BFF, and episode workspace; invalidation previews load persisted snapshots rather than accepting client snapshot state.

Changed paths: persistence production-state migration/repository/workflow adapter; artifact API/OpenAPI/SDK; web BFF/runtime test fixture.

Checks: `pnpm test:focused -- packages/persistence/src/production-state-repository.unit.test.ts` (pass after one targeted repair); API SDK build and web typecheck (pass). API HTTP integration test was blocked by sandbox socket `EPERM` before product assertions.

Risks: worker call-site integration and browser invalidation confirmation remain follow-up work; comparison modes correctly remain unavailable until a diff service exists.

Follow-up: wire snapshot append to the durable worker and finish the YSAAS-017 confirmation journey.
