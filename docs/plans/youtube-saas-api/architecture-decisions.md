# Architecture decisions

## ADR-YSAAS-001 — Production identity
**Decision:** Introduce `ProductionRevision` as immutable revision-centric production identity. `EpisodeProductionState` is a replaceable read projection over it and typed related resources.  
**Evidence:** `episode_revisions` are immutable and workflow admission pins `episodeRevision`; no existing aggregate has the broader responsibility.  
**Reason:** Preserve existing identity while preventing UI-derived lifecycle state.  
**Stories affected:** US-006, US-011, US-017, US-028, US-032, US-062.

## ADR-YSAAS-002 — Invalidation graph
**Decision:** Model brief/script, narration, visual plan, independently addressable scene visuals/maps/diagrams, TTS, subtitles, render, and review/publish readiness as typed production units. Invalidate only units whose dependency/input fingerprints changed.  
**Evidence:** `productionUnitIdSchema`, workflow task dependencies, artifact hashes, and profile-specific regeneration already exist in partial form.  
**Reason:** Enable selective regeneration without hidden or excessive downstream work.  
**Stories affected:** US-008–US-011, US-018, US-028, US-032, US-050.

## ADR-YSAAS-003 — Artifact identity
**Decision:** Artifact record identity is stable; content hash is immutable content identity; provenance, generating run, source revision, dependency inputs, validation, and reuse are explicit relationships.  
**Evidence:** Existing asset descriptors, artifact contracts, SHA-256 bindings, and object-storage boundaries.  
**Reason:** Comparisons, reviews, reuse, and publication must never depend on filenames.  
**Stories affected:** US-008–US-010, US-014, US-027–US-028, US-050.

## ADR-YSAAS-004 — Review policy and validity
**Decision:** Review quorum is one. Review requirement is profile-configurable; profiles may require reviewer != producer. Assignment may be explicit or claimed by any authorized reviewer. Reject, request-changes, and override require rationale; approval rationale is optional. Approval binds the production revision, evidence-set hashes, resolved-configuration fingerprint, role, policy, and expiry.  
**Evidence:** Current challenges bind subject revision/hash/expiry and approval mutations are guarded.  
**Reason:** Extend the existing exact-decision model without a competing approval engine.  
**Stories affected:** US-002, US-026–US-029.

## ADR-YSAAS-005 — Policy override boundary
**Decision:** Only tenant owner/admin may override an overridable product gate, with rationale and immutable audit. Security, tenant isolation, revision/hash binding, stale-review rules, credential handling, and idempotency cannot be overridden.  
**Evidence:** Existing action permissions, append-only audit, and fail-closed approval checks.  
**Reason:** Allow accountable product exceptions without weakening platform invariants.  
**Stories affected:** US-011, US-023, US-039–US-040, US-061.

## ADR-YSAAS-006 — Localization identity
**Decision:** One logical/root episode owns locale variants. Each variant has immutable source episode/revision linkage and independent production revisions. Slugs are presentation/publishing identifiers and may differ by locale.  
**Evidence:** Existing localization commands and multilingual packages lack a SaaS derivative aggregate.  
**Reason:** Separate canonical identity from filesystem/slug conventions.  
**Stories affected:** US-012–US-015.

## ADR-YSAAS-007 — Capability and configuration ownership
**Decision:** Platform owns lifecycle invariants, revision/hash semantics, capability contract shape, auth boundaries, secrets, audit integrity, idempotency, and stale-review rules. Tenants may configure permitted genre/channel defaults, voices, enabled locales, review requirement, publishing defaults, quotas, and notifications. Resolution order remains platform → tenant/channel → genre → episode → pinned revision.  
**Evidence:** Typed profile contracts, dynamic overrides, workflow admission, and pilot UI mappings.  
**Reason:** Remove duplicated UI policy and distinguish configuration from resolved runtime state.  
**Stories affected:** US-003–US-004, US-013, US-016–US-019, US-023–US-024.

## ADR-YSAAS-008 — Identity and secrets
**Decision:** IdP authenticates; application/domain owns membership, roles, and resource authorization. Use existing IdP step-up when available. Secrets are tenant-bound, displayed once, never retrievable, redacted everywhere, and never shared across tenants. Rotation overlap is server-configurable and defaults to no overlap when unset.  
**Evidence:** OIDC BFF, workspace principal directory, hashed pilot keys, and server-side secret handles.  
**Reason:** Preserve the current BFF and tenant-authority boundaries.  
**Stories affected:** US-038–US-045, US-056–US-057, US-061.

## ADR-YSAAS-009 — Provider and voice controls
**Decision:** Provider health is `available | degraded | unavailable | unconfigured | unsupported`. Material fallback is explicit and policy-driven. Provider-free fixtures replace provider boundaries, not application/domain behavior. Cloned voices persist identity, subject, attestation time, scope, provider voice ID, status, and revocation; revocation blocks future generation while retaining history.  
**Evidence:** Provider-neutral speech service and ADR-SPEECH-001–003.  
**Reason:** Reuse current abstraction and consent/version rules without claiming legal sufficiency.  
**Stories affected:** US-003, US-019, US-024, US-056, US-058.

## ADR-YSAAS-010 — Usage and quota
**Decision:** Estimates are advisory; measured usage is authoritative. Expensive work checks/reserves capacity at admission and reconciles against actual usage afterward.  
**Evidence:** Existing quota, usage ledger, speech estimate, and workflow admission components.  
**Reason:** Provider billing APIs are not a product dependency.  
**Stories affected:** US-021–US-023.

## ADR-YSAAS-011 — Idempotency and audit
**Decision:** Idempotency is scoped by workspace, principal, method, normalized route, key, and request fingerprint. Same fingerprint replays; changed fingerprint conflicts. Audit is append-only and correlates actor, command, resource, revision, hashes, before/after state, and effect IDs.  
**Evidence:** Accepted API decision register, command admissions, effect records, and usage/audit repository.  
**Reason:** Provide consistent retry and accountability semantics across UI and API clients.  
**Stories affected:** US-007, US-027, US-033–US-035, US-040, US-043–US-046, US-061–US-062.

## ADR-YSAAS-012 — Publishing authority
**Decision:** Implement publishing behind a platform capability flag that defaults off. Connections are tenant-owned; tokens remain server-side. Upload is private-first, followed by processing validation and intended visibility. Intents are immutable; execution rechecks revision, hashes, approval, destination, policy, quota, and leases. Retry transient faults only within the existing bounded worker policy; ambiguity enters reconciliation. No v1 recovery SLO is promised.  
**Evidence:** Publication intents, leases, recovery markers, resumable adapter, and read-only publication API already exist; API admission currently fixes publication to `none`.  
**Reason:** Preserve current fail-closed behavior while creating one safe future path.  
**Stories affected:** US-030–US-037, US-057.

## ADR-YSAAS-013 — Publishing metadata and schedule
**Decision:** V1 metadata is title, description, tags, locale, thumbnail, captions, visibility, and scheduled time. Caption requirements are profile/channel configurable. Scheduling requires a server-configured horizon and provider-valid time; absent configuration disables scheduling.  
**Evidence:** Existing publication intent already carries channel, visibility, schedule, playlists, approval, and artifact bindings.  
**Reason:** Keep provider restrictions and scheduling assumptions out of frontend code.  
**Stories affected:** US-031, US-032, US-034, US-037.

## ADR-YSAAS-014 — UX baseline
**Decision:** Launch queues filter by status, channel, genre, locale, workflow stage, review/publishing status, assignee, and updated date. Search indexes episode title/slug/ID and run ID only. Active actions retain 30 days. Comparisons use text side-by-side plus line/semantic diff, visual side-by-side, and timestamp-aware media comparison; no waveform/frame diff. All frontend tasks target WCAG 2.2 AA. Conflicts never silently overwrite and do not auto-merge structured briefs.  
**Evidence:** Current web runtime has basic navigation, ETag conflict handling, and accessible primitives but no portfolio search/action center.  
**Reason:** Fix the v1 UX boundary and prevent speculative indexing/comparison work.  
**Stories affected:** US-001–US-002, US-009, US-014, US-020, US-059–US-062.

## ADR-YSAAS-015 — Publish-ready
**Decision:** A current production revision is publish-ready only with a successful required render, passing blocking validations, current required approval, required metadata/assets, authorized destination, and zero blocking gates. Profiles may add requirements but cannot weaken platform invariants.  
**Evidence:** Validation, approval, render, publication intent, and gate concepts exist separately.  
**Reason:** Provide one canonical readiness definition.  
**Stories affected:** US-006, US-011, US-028, US-032, US-058.

## Repository reconciliation

The supplied publication decision conflicts with ADR-OPERATIONS-001's blanket
API-publication prohibition. This plan preserves its safety intent by leaving
current behavior unchanged and the new capability flag off until YSAAS-024.
YSAAS-014 must record the superseding operational decision before exposing an
enabled mutation. No parallel publication abstraction is permitted.

## Remaining open questions

None. Credential overlap, scheduling horizon, provider restrictions, and flag
enablement are required deployment configuration/evidence. Missing values fail
closed.
