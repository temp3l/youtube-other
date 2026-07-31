# YouTube API Implementation Tasks

These tasks turn the architecture backlog into dependency-ordered, independently reviewable implementation packages. They do not authorize implementation. Before starting a task, confirm its operator decisions and evidence gates in the decision register.

## Execution Order

| Task | Package                                                                                           | Depends on    | Gate                                 |
| ---- | ------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------ |
| 00   | [Finalize architecture decisions](task-00-finalize-architecture-decisions.md)                     | none          | required before production changes   |
| 01   | [Characterize canonical behavior](task-01-characterize-canonical-behavior.md)                     | 00            | required before extraction           |
| 02   | [Characterize external effects](task-02-characterize-external-effects.md)                         | 01            | required before provider refactoring |
| 03   | [Application contracts and composition](task-03-application-contracts-and-composition.md)         | 01            | shared boundary                      |
| 04   | [Relational state and transitions](task-04-relational-state-and-transitions.md)                   | 03            | PostgreSQL authority                 |
| 05   | [Durable dispatch, idempotency, and outbox](task-05-durable-dispatch-idempotency-and-outbox.md)   | 02–04         | worker safety                        |
| 06   | [Dark Truth canonical bindings](task-06-dark-truth-canonical-bindings.md)                         | 01, 03        | operator-approved semantics          |
| 07   | [Education pilot parity](task-07-education-pilot-parity.md)                                       | 01, 03        | entitlement evidence                 |
| 08   | [CLI cutover and legacy authority](task-08-cli-cutover-and-legacy-authority.md)                   | 04–07         | no dual writers                      |
| 09   | [Contract-first internal API](task-09-contract-first-internal-api.md)                             | 03–05, 08     | no long work before task 10          |
| 10   | [Worker reliability and cancellation](task-10-worker-reliability-and-cancellation.md)             | 05–09         | executable async API                 |
| 11   | [Tenant identity and authorization](task-11-tenant-identity-and-authorization.md)                 | 04, 09        | external access                      |
| 12   | [Object storage and legacy asset migration](task-12-object-storage-and-legacy-asset-migration.md) | 04, 08, 11    | external asset access                |
| 13   | [Webhooks and public contract stability](task-13-webhooks-and-public-contract-stability.md)       | 05, 09, 11    | external integration                 |
| 14   | [Usage, audit, quotas, and security gate](task-14-usage-audit-quotas-and-security-gate.md)        | 05, 10–13     | external pilot                       |
| 15   | [Publication safety and reconciliation](task-15-publication-safety-and-reconciliation.md)         | 02, 05, 10–14 | YouTube mutation                     |
| 16   | [Pilot and GA acceptance](task-16-pilot-and-ga-acceptance.md)                                     | 07, 11–15     | release decision                     |

## Global Rules

- CLI, API, workers, and schedulers call one typed application/workflow layer.
- Do not expose CLI subprocesses, filesystem paths, provider DTOs, or low-level task execution through the API.
- Use one writer per aggregate and workflow instance; compatibility output is projection-only.
- All paid or irreversible provider effects use durable intent/effect records and fail closed when outcomes are uncertain.
- Run the directly affected test file first and stay within the repository verification budget.
- Complete each task with its own focused review; do not merge unrelated cleanup.
