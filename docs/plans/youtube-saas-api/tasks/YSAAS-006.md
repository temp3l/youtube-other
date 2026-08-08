# YSAAS-006 — Artifact lineage, invalidation, regeneration

## Objective
Make artifact comparison, dependency invalidation, selective regeneration, and gate evidence canonical.
## Stories covered
US-008–US-011, US-028, US-032, US-050.
## Dependencies
YSAAS-001–YSAAS-004.
## Existing implementation
Artifact contracts/descriptors, hashes, validators, object storage, workflow dependencies, profile-specific regeneration utilities.
## Required changes
- Domain: implement ADR-YSAAS-002/003 production-unit graph, input fingerprints, invalidation preview, lineage, reuse ownership, and gate evidence.
- API/SDK/BFF: artifact versions/baselines, comparison metadata, invalidation preview, scoped regeneration command.
- Frontend support: text/visual/timestamp-aware comparison payloads; no waveform/frame diff.
- Authorization/audit: validate both comparison/reuse resources; audit regeneration/reuse.
- Tests: narration/voice/visual/metadata/config invalidation examples and independent scene/map/diagram regeneration.
## Explicit non-goals
Final media-player UI, semantic merge, provider invocation redesign, or cross-tenant asset marketplace.
## File ownership
Artifact/validation/regeneration modules and graph migrations; review validity consumes but does not redefine them.
## Acceptance criteria
Preview exactly identifies invalidated units; unaffected upstream units remain valid; artifact baseline may be previous/approved/source; stale review/publish readiness follows changed evidence.
## Validation
Focused graph, artifact, validation, regeneration, and contract tests; package typecheck.
## Completion evidence
Dependency matrix, invalidation fixtures, contract/tests, cache/reuse risks.
