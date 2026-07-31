# Persistence and Assets

## Authority decision

| Option                           | Finding                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| Existing JSON logs authoritative | useful evidence/compatibility; reject for multi-writer tenant API                  |
| Relational current state only    | simplest queries/transactions, but loses forensic history alone                    |
| Full event sourcing              | unnecessary v1 complexity                                                          |
| Durable framework state          | no framework exists; cannot replace business records                               |
| Transitional hybrid              | **Recommended:** relational state + append-only events; JSON import/export adapter |

Current SQLite stores only episode JSON and is not a workflow authority (`packages/persistence/src/index.ts`). Current generic JSONL events and atomic projections are good source material but lack database CAS, tenant queries, transactionally coupled jobs/outbox, and distributed leases.

## Minimum relational boundary

Workspace/project/principal membership; episode/revisions; workflow definitions/runs/steps/attempts/events; jobs/leases/dead letters; assets/lineage/validations; approvals; publication intents/effects; idempotency; outbox/webhook deliveries; credentials references; usage/audit.

Every tenant row includes `workspace_id`; tenant foreign keys include it. Mutable aggregates have revisions. Attempts/events/usage/audit are append-only. PostgreSQL is recommended for production; SQLite may remain offline/local compatibility if operator-approved.

## Filesystem transition

1. Read and characterize JSON; no dual write.
2. Import with source path/schema/hash as immutable legacy records.
3. New `database-v1` runs use SQL authority; compatibility JSON is projected asynchronously.
4. Mark each workflow instance `filesystem-legacy` or `database-v1`; reject the wrong writer.
5. Move CLI to use cases, then retire specialized stores from writing.

## Asset design

The existing `artifactManifestSchema` already carries logical identity, relative location, SHA-256, bytes, MIME, producer/version/attempt, validation, dependencies, and time. Preserve those semantics behind `AssetRepository`.

- Public callers receive opaque IDs, never path/key.
- Prepare-upload returns short-lived presigned multipart instructions, required headers, allowed MIME/size, upload ID, and checksum expectation.
- Complete-upload validates actual bytes, MIME sniffing/container/dimensions/duration, hash, size, malware policy, and tenant ownership.
- Stage to quarantine; promote/copy to immutable tenant-prefixed final key; then commit asset availability.
- Large downloads use short-lived authorized object-store/CDN URLs.
- Local driver requires lexical/realpath/symlink containment and checksum verification.
- Assets are immutable; revisions create new assets. Cross-tenant physical dedupe never grants logical access.
- Lifecycle: `uploading`, `quarantined`, `ready`, `rejected`, `temporary`, `retained`, `legal_hold`, `deletion_pending`, `deleted`.
- Idempotent cleanup handles partial uploads/unregistered blobs; retention and legal hold are policy controlled.

Object storage is required before external multi-tenant pilot. A shared-volume filesystem driver is acceptable for the internal single-host MVP.
