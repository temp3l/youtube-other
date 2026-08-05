# ADR-OPERATIONS-001: Current scope and publication authority

Date: 2026-08-02  
Status: accepted

## Decision

1. Math education is German-only for the current rollout. The supported learner
   locale is `de`; no non-German lesson, narration, subtitle, thumbnail,
   curriculum, or acceptance requirement is in scope. A later locale expansion
   requires a new explicit decision and reviewed locale evidence.
2. Publication is an operator-initiated, on-demand CLI action. The API may
   expose read, planning, status, approval, and reconciliation surfaces, but
   it must not initiate a provider publication, schedule one, or auto-publish.
3. A CLI publication remains fail-closed: it needs the existing approval,
   credential, channel-identity, media, receipt/reconciliation, and rights
   checks. This decision does not authorize a live upload or weaken those
   checks.

## Blocker disposition

| Area | Disposition |
| --- | --- |
| Math locale ambiguity and five-locale acceptance work | Resolved by the German-only scope above; defer non-German locale work. |
| API-versus-CLI publication authority | Resolved: CLI-only, on-demand initiation; API stays non-mutating for publication. |
| History provider research bindings and map/timeline render adapters | Deferred; no active delivery depends on them. |
| Speech consent/exporter, video-ID lookup, and direct journal/API orchestration | Deferred; retain the compatibility facade and current CLI path. |
| Strategic Task 08 lineage failure | Requires a code repair and focused verification; not resolved by an operating decision. |
| Strategic rights, creator-media, CTA, remote-render, and reference-edit gates | Remain intentionally fail-closed pending operator evidence or provider verification. |
| Worker abort propagation, quarantine, and uncertain-effect reconciliation | Deferred; no irreversible publication may depend on the generic worker alone. |
| Research-informed horror plan | Deferred as proposed work, not a release blocker. |

## Consequences

Implementation and acceptance plans must not claim German multi-locale coverage
or API-triggered publication. Existing historical documents that mention broader
rollouts remain records of their original scope; this decision governs new work
from this date.
