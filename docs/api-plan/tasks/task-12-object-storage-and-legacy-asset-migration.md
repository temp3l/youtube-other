# Task 12: Object Storage And Legacy Asset Migration

## Objective

Make immutable, tenant-scoped object storage authoritative for external assets and safely migrate legacy filesystem episodes.

## Scope

- implement quarantine, validation, promotion, signed transfer, multipart upload, retention, and cleanup
- inventory legacy assets and preserve hashes, MIME, bytes, logical roles, dependencies, and provenance
- copy and verify before registering a new object locator
- atomically switch aggregate asset authority after all required objects verify
- resume partial migrations and retain source files through the rollback window
- prevent physical deduplication from granting cross-tenant logical access

## Tests And Verification

Add MIME/hash/size/polyglot, signed-URL, guessed-ID, copy-crash, hash-mismatch, partial-resume, atomic-cutover, rollback, and orphan-reconciliation tests.

## Acceptance Criteria

Failed registration never produces a ready asset, migrated episodes keep identical logical lineage, and either the old or new authority is active—never both writers.
