# API MVP

## Scope challenge

- **Verified:** the nominal customer journey is not safely exposable from the current HTTP app because auth, tenancy, shared composition, durable state, object storage, and public contracts do not exist.
- **Recommended:** distinguish internal API MVP from external pilot. Shipping publication in the first internal slice would place the highest-risk side effect on an unproven foundation.

## Internal API MVP

1. Create/read one project and a strictly typed episode.
2. Start one high-level `episode-production` workflow through shared use cases and receive `202`.
3. Poll job/run/phase status.
4. List/retrieve immutable generated asset metadata through the local storage bridge.
5. Present and record one revision/hash-bound approval.
6. Run provider-free fixtures; no public internet, customer credentials, webhooks, or YouTube mutation.

This is externally coherent at the contract level but an internal contract-proving release.

## External pilot

- OIDC/service accounts, workspace authorization, tenant-safe object storage and channel credentials.
- One entitled profile workflow end to end; both profile unions remain correctly modeled.
- Signed webhooks plus polling.
- Quotas, audit, usage, support runbook, and reconciliation UI/command.
- Approved publish/schedule with publication intent, effect journal, channel serialization, and fail-closed ambiguous recovery.

## General availability

Both Dark Truth and mathematics full/Short workflows characterized and supported; durable multi-worker operations; DR/backup/restore; key rotation; webhook replay; stuck-run handling; published compatibility/SLO policy; stable TypeScript SDK; usage exports; load/soak/security testing.

## Later

SSE, GraphQL read projections, customer workflow authoring, more grades, provider choice, billing, bulk creation, additional SDKs, and stronger physical tenant isolation tiers.

## Explicit non-goals

Low-level step endpoints; raw prompts/provider payloads; arbitrary URLs/paths/CLI flags; filesystem browsing; synchronous render/publish; caller-selected providers; blind retry of uncertain publication; generic domain fields that erase story-bible/curriculum semantics; immediate billing.

## First customer workflow recommendation

Create a structured episode, run full production for one entitled profile and locale/variant set, inspect assets and validation, approve, then publish/schedule and receive events. The first external pilot profile is **Unresolved**; customer value and characterization completeness must decide it, not package maturity alone.
