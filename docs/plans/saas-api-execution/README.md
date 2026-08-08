# SaaS And API Execution Pack

## Purpose

This pack turns the implemented API foundation and the remaining product gates
into bounded, dependency-ordered tasks suitable for `terra/high`. It plans work;
it does not authorize paid providers, customer data, public exposure, or YouTube
mutation.

## Authoritative Inputs

- `docs/api-plan/PLAN-STATUS.md`
- `docs/api-plan/05-target-architecture.md`
- `docs/api-plan/18-migration-roadmap.md`
- `docs/api-plan/19-api-mvp.md`
- `docs/api-plan/tasks/task-16-pilot-and-ga-acceptance.md`
- current source and focused tests under `apps/api`, `apps/cli`, `apps/web`,
  `packages/application`, `packages/api-sdk`, and `packages/persistence`

Source code remains authoritative when an older planning statement conflicts
with implemented behavior.

## Current Starting Point

- The tenant-scoped PostgreSQL API, durable jobs, SDK, webhooks, quotas, audit,
  object-storage ports, and safe publication reconciliation foundation exist.
- Irreversible publication, production provider composition, public transfers,
  and external pilot exposure are intentionally disabled.
- `apps/web` is a TypeScript rendering library, not a deployable SaaS runtime.
- The API lacks several SaaS read-model operations, including discovery/listing
  surfaces needed for projects, episodes, assets, approval challenges, and the
  signed-in principal's available workspaces.

## Execution Rule

Run one task at a time with `terra/high`. Tasks are intentionally small enough
that the agent should inspect, implement, run focused verification, and report
within one context. Do not use a single prompt such as “finish the SaaS/API.”

Before each implementation task:

1. Read `AGENTS.md` and `docs/ai-context/context-pack.md`.
2. Read this README, the task file, and only the linked API-plan sources.
3. Inspect current source before accepting this pack's assumptions.
4. Confirm every human/external gate named by the task.
5. Preserve fail-closed behavior for paid and irreversible effects.

Every task that modifies files must create both required reports:

- `docs/reports/<YYYY-MM-DD>/<task-file-name>-implementation-report.md`
- `docs/reports/codex-runs/<YYYY-MM-DD>-<short-task-name>.md`

## Task Index

1. [Task 00: pilot decisions](tasks/task-00-pilot-decisions.md)
2. [Task 01: baseline and contract gap](tasks/task-01-baseline-and-contract-gap.md)
3. [Task 02: production workflow composition](tasks/task-02-production-workflow-composition.md)
4. [Task 03: CLI authority cutover](tasks/task-03-cli-authority-cutover.md)
5. [Task 04: external adapter composition](tasks/task-04-external-adapter-composition.md)
6. [Task 05: deployment process topology](tasks/task-05-deployment-process-topology.md)
7. [Task 06: web runtime and BFF](tasks/task-06-web-runtime-and-bff.md)
8. [Task 07: SaaS read-model API](tasks/task-07-saas-read-model-api.md)
9. [Task 08: identity, session, and onboarding](tasks/task-08-identity-session-and-onboarding.md)
10. [Task 09: project, episode, and workflow UI](tasks/task-09-project-episode-workflow-ui.md)
11. [Task 10: assets, validations, and approvals UI](tasks/task-10-assets-validations-approvals-ui.md)
12. [Task 11: integrations, usage, and reconciliation UI](tasks/task-11-integrations-usage-reconciliation-ui.md)
13. [Task 12: internal pilot end to end](tasks/task-12-internal-pilot-e2e.md)
14. [Task 13: external pilot hardening](tasks/task-13-external-pilot-hardening.md)
15. [Task 14: publication mutation](tasks/task-14-publication-mutation.md)
16. [Task 15: pilot release acceptance](tasks/task-15-pilot-release-acceptance.md)

See [implementation-plan.md](implementation-plan.md) for dependencies and gates.
