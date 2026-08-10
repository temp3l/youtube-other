# Non-Functional Requirements

## NFR-01 — Revision integrity
Approved production revisions and source artifacts are immutable. Remediation creates a new revision or derivative.

## NFR-02 — Deterministic lineage
Every generated/reused artifact must identify its semantic inputs, effective configuration, and parent revision sufficiently to explain reuse or regeneration.

## NFR-03 — Idempotency
Retriable state-changing operations, especially API-triggered production/publishing tasks, must have explicit idempotency semantics.

## NFR-04 — Narrow invalidation
Regeneration must be dependency-aware. A change must not invalidate unrelated artifacts merely because they belong to the same episode.

## NFR-05 — Cost containment
Paid provider calls must have bounded retries, caching/reuse where safe, preflight, and optional budget enforcement. Bulk runs must not create unbounded parallel paid work.

## NFR-06 — Localization reuse
Changing locale alone must not invalidate language-independent visual assets. Localized text should be composited separately whenever feasible.

## NFR-07 — Source immutability
Uploaded source material is never modified in-place. Redesigns/crops/translations are derivatives.

## NFR-08 — Multi-tenant isolation
Tenant ownership must be enforced on every resource access path, including object storage, jobs, credentials, logs, and API reads/writes.

## NFR-09 — Authorization
Creator, reviewer, operator, and administrator capabilities must be independently enforceable. Approval and publishing require explicit authorization.

## NFR-10 — Secret handling
Provider/publishing secrets are never logged or emitted in approval packs. Secret references may be audited without values.

## NFR-11 — Observability
Production runs need structured status, correlation IDs, stage latency, retries, cache hit/miss, provider usage, and actionable failure diagnostics.

## NFR-12 — Failure isolation
A failed stage or episode must not invalidate successful unrelated work. Bulk runs support partial success.

## NFR-13 — Resumability
Runs must resume from the earliest stale/failed dependency rather than restart from ingestion by default.

## NFR-14 — Typed contracts
Internal and external stage/resource contracts should use explicit versioned schemas rather than unstructured shared dictionaries.

## NFR-15 — Rendering reproducibility
Render manifests record composition revision, locale, aspect ratio, audio/caption versions, FFmpeg/render configuration, and source asset identifiers.

## NFR-16 — Accessibility/readability
On-screen text and captions must support mobile-safe composition, minimum readability policy, clipping/safe-area validation, and localization-driven reflow.

## NFR-17 — Auditability
Approvals, rejections, administrative configuration changes, publishing actions, and significant provider fallbacks must be attributable and timestamped.

## NFR-18 — Backward compatibility
Versioned APIs and persisted production artifacts must tolerate future schema evolution through explicit migration/compatibility strategy.

## NFR-19 — Performance
Large sources and bulk packs should use streaming/chunked processing where practical, bounded memory, content-hash reuse, and indexed artifact/status lookup.

## NFR-20 — Security
Uploaded content must be treated as untrusted input. File validation, path traversal protections, content-type verification, authorization, and sandboxing/isolation must apply where relevant.
