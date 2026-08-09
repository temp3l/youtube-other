# Capability configuration hierarchy

Summary: added authoritative tenant, profile/genre, and episode configuration persistence with workspace RLS, schema validation on every read, migration registration, and transaction-scoped retrieval methods.

Changed paths: capability configuration repository/migration/test, persistence exports/registry, workflow transaction adapter, and migration-order test.

Checks: `pnpm test:focused -- packages/persistence/src/postgres-capability-configuration-repository.unit.test.ts` passed.

Risks: provisioning writers and tenant-scoped capability/resolution API/UI remain to be implemented. The store correctly has no pilot fallback.

Follow-up: add fail-closed resolution API over these layers, then replace current web pilot mappings with that response.
