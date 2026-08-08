# SaaS And API Implementation Plan

## Objective

Deliver an internal SaaS first, then a restricted external pilot, using the
existing canonical application/workflow layer. The web app, API, CLI, workers,
and schedulers must remain adapters over the same typed use cases.

## Non-Negotiable Boundaries

- Do not introduce web-owned story, math, media, render, or publish logic.
- Do not execute arbitrary CLI commands from API jobs.
- Keep one writable authority per workflow instance.
- Do not expose filesystem paths, secrets, provider payloads, or raw prompts.
- Keep uploads/publication disabled until their explicit release gates pass.
- Billing is out of scope for the pilot; usage and quota visibility are in scope.

## Dependency Graph

```text
00 decisions ─┬─> 02 workflow composition ─> 03 CLI cutover ─┐
              ├─> 04 external adapters ─> 05 deployment ─────┤
              └─> 06 web runtime ─┬─> 08 identity/onboarding ┤
01 baseline ──────────────────────┼─> 07 read-model API ─────┤
                                  └───────────────────────────┘
07 + 08 ─> 09 core UI ─> 10 review UI ─> 11 admin UI
02–11 ─> 12 internal pilot ─> 13 external hardening
13 ─> 14 publication mutation ─> 15 release acceptance
```

Task 01 may run before Task 00 is fully signed off because it is
characterization-only. All production/deployment choices wait for Task 00.

## Execution Waves

| Wave | Tasks | Outcome                                         | External effect policy          |
| ---- | ----- | ----------------------------------------------- | ------------------------------- |
| A    | 00–01 | Signed boundary and verified gap register       | Read-only/docs/tests            |
| B    | 02–03 | Canonical production composition and one writer | Provider fakes only             |
| C    | 04–05 | Deployable API/worker/storage/secret topology   | Local/test services             |
| D    | 06–08 | Secure SaaS runtime, query contract, onboarding | Local IdP fixture               |
| E    | 09–11 | Usable customer and operator workflows          | No paid/publish calls           |
| F    | 12    | Provider-free internal pilot                    | No external mutations           |
| G    | 13    | Restricted external-pilot evidence              | Controlled, approved calls only |
| H    | 14    | Ambiguity-safe private publication              | Explicit per-run approval       |
| I    | 15    | Evidence-backed release decision                | Advertise proven cells only     |

## Human Decisions Required In Task 00

- pilot profile, locale, and full/Short entitlement matrix
- IdP and human/service authentication policy
- SaaS web framework, BFF/session model, and hosting target
- PostgreSQL, secret manager/KMS, and S3-compatible storage deployment
- YouTube OAuth ownership and private-first publication policy
- quota values, retry-cost ownership, retention, residency, RTO/RPO, SLOs,
  escalation ownership, and API compatibility window

Unresolved values must remain explicit blockers, not implementation defaults.

## Verification Strategy

- Run the directly affected focused test file first.
- Use at most three distinct test commands per task and at most one affected
  package typecheck after focused tests pass.
- Use isolated PostgreSQL/object-store/IdP fixtures; never truncate a shared DB.
- Provider and YouTube tests use fakes until Tasks 13–14 receive explicit human
  authorization and numeric cost/effect ceilings.
- No broad build, full test suite, snapshot update, or fixture regeneration
  without explicit authorization.

## Commit And Rollback Strategy

Keep every task in its own commit. Contract additions must land with SDK and
compatibility coverage. Database changes must be additive until the authority
cutover has passed. Roll back by disabling new admissions or UI exposure while
allowing existing database-owned runs to finish or enter explicit reconciliation.

## Completion Definition

The project is ready for an external pilot only when Task 15 records passing
evidence for authentication, tenant boundaries, end-to-end workflow execution,
asset review, approvals, webhooks, quotas/audit, restore/rotation/load drills,
and ambiguity-safe publication. Until then it remains internal-only.
