# ADR-MICRODRAMA-002: Embedded microdrama persistence and artifact boundary

Date: 2026-08-12
Status: accepted

## Context

Phase 00 proposed PostgreSQL for microdrama, while the approved deployment is
local-first and explicitly does not require PostgreSQL. The repository already
uses SQLite and filesystem artifacts, but its existing SQLite table is not a
complete narrative/workflow authority.

## Decision

New microdrama structured state uses an embedded SQLite repository behind typed
ports. PostgreSQL is not required and Prisma must not be added. Use migrations,
foreign keys, transactions, optimistic revision/CAS, append-only events/effects,
unique idempotency keys, and replayable projections.

Large scripts/source artifacts, audio, images, video, alignments, renders, and
provider evidence remain filesystem/object-backed and hash-addressed. SQLite
stores only typed metadata, hashes, lineage, paths/URIs, approvals, and state.

Reuse the existing workflow engine and add embedded adapters where required.
This ADR supersedes Phase 00 and ADR-API-004 only for the new microdrama bounded
context; it does not authorize rewriting legacy PostgreSQL/API functionality.

## Consequences

- Microdrama can run without a database service.
- Backup/restore must cover the SQLite file and referenced immutable artifact
  roots consistently.
- Multi-host scaling requires a future ADR; it cannot silently replace the
  embedded authority.
- Existing `SQLitePersistence` is precedent but needs additive microdrama
  schemas and repositories.

## Alternatives rejected

- PostgreSQL as a microdrama prerequisite.
- Prisma or another ORM layer.
- A second workflow engine.
- Storing large media blobs in the embedded database.
- Filesystem presence as authoritative structured runtime state.
