# Implementation roadmap

## Outcomes

The roadmap establishes `ProductionRevision` as immutable production identity,
serves `EpisodeProductionState` as its read projection, centralizes capability
resolution, then builds production, review, localization, publishing, platform,
and operational journeys on those contracts. Provider-free acceptance precedes
any external or irreversible enablement.

## Phases

### Foundation

YSAAS-001–004 establish production state, capabilities, authorization/audit/
idempotency, and modular contract ownership. They are prerequisites, not UI
features.

### Production domain and APIs

YSAAS-005–012 deliver workflow recovery, artifact invalidation, review,
localization, bulk operation, usage/provider health, credentials, and webhooks.
Existing durable workflow, approval, speech, usage, and webhook components are
extended rather than replaced.

### Publishing and lifecycle

YSAAS-013–016 add publication preparation/execution and content reuse/retention.
Publishing is private-first and feature-flagged. The flag remains disabled until
OAuth and publishing acceptance completes.

### Frontend journeys

YSAAS-017–022 consume typed API/BFF contracts. The frontend never reconstructs
canonical state, capability support, invalidation, or approval validity.

### Acceptance and external gates

YSAAS-023 proves the deterministic provider-free journey with fixture providers
at external boundaries. YSAAS-024 reuses the existing hardening/release backlog
to decide which externally backed capability cells may be enabled.

## Existing backlog reconciliation

- Existing SaaS Tasks 00–11 are evidence for current partial capabilities, not
  competing ownership.
- YSAAS-023 reuses and completes existing Task 12.
- YSAAS-024 reuses existing Tasks 13 and 15.
- YSAAS-014 absorbs and supersedes existing Task 14; it must not create a second
  publication command path.

## Completion

All JNY-001–JNY-010 are implementable after YSAAS-024. Before that gate,
provider-free journeys terminate at approved/publish-ready evidence and live
publication remains unavailable.
