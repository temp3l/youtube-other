# Migration Roadmap

## Principles

No big-bang rewrite, no API-owned pipeline, and no dual writable authority. Characterize before extraction; migrate one operation family; switch the CLI to prove parity; then expose it internally. Each workflow instance declares `filesystem-legacy` or `database-v1`.

## Phases and gates

| Phase                      | Deliverables                                                                                           | Exit gate                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 0 Characterize             | inventory all entry paths/stores; fixtures for Dark Truth full/Short and math; publication fault tests | product owner identifies canonical behavior where paths diverge      |
| 1 Application seams        | typed actor/command/query/result; composition root; ports for state/assets/providers/render/publish    | CLI can invoke one extracted read-only/plan use case with parity     |
| 2 Normalize workflow state | relational runs/steps/attempts/jobs/leases/events/idempotency/outbox; JSON importer                    | concurrency, crash, lease, retry, resume tests pass                  |
| 3 Bind domain tasks        | Dark Truth existing services bound; complete math approval/publish and verify Short gaps               | provider-free canonical workflows pass both profiles                 |
| 4 CLI migration            | command families call use cases; authority markers; compatibility projections                          | normalized CLI outcomes and artifacts match characterization         |
| 5 Internal API             | OpenAPI contract, controllers, polling, local asset bridge, internal authentication                    | no controller calls CLI/low-level orchestration; internal E2E passes |
| 6 Worker/asset hardening   | separate workers, abort/heartbeat/dead letters, object storage, upload validation                      | fault injection and resource limits pass                             |
| 7 Tenant/security          | OIDC/service accounts/API keys, tenant repositories, credentials, audit, quotas                        | BOLA, secret rotation, cross-tenant storage tests pass               |
| 8 External pilot           | signed webhooks, ambiguity-safe publishing, SDK, support/reconciliation tooling                        | crash after every YouTube boundary cannot auto-duplicate             |
| 9 GA                       | both profiles, DR/SLO/load, compatibility policy, retention/deletion, incident drills                  | operator GA checklist approved                                       |

## Critical path

Characterization → canonical behavior decision → application ports/composition → relational job/workflow authority → Dark Truth bindings and math gaps → CLI parity → internal API → tenant/object-storage boundary → publication effect journal/reconciliation → external pilot.

OpenAPI read/query work, observability schemas, OIDC discovery spike, and object-storage adapter can run in parallel after application identifiers/ports stabilize. Public publishing cannot.

## Rollback strategy

Roll back per workflow instance, not by letting two writers race. Before a run starts, choose authority. A database run may keep producing filesystem projections for legacy readers. If a migrated command fails its release gate, route only new instances back to the characterized legacy adapter; leave existing database runs to finish or explicitly migrate with audited tooling.

## Operator decisions before Phase 1 ends

Canonical Dark Truth path, production database, offline CLI requirement, first pilot profile/use case, identity provider, customer-vs-platform YouTube OAuth ownership, private-first publication policy, retention/residency, and YouTube recovery evidence standard.

## Legacy removal

Remove a writable store/subprocess wrapper only after all callers delegate, legacy imports are preserved read-only, telemetry shows no use for a release window, and rollback documentation exists. Do not remove compatibility readers in the initial API program.
