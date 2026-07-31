# API Plan Status

- **Overall status:** Architecture decisions board accepted; implementation in progress
- **Planning prompt:** `todo-prompts/api-planning/00-plan-api-multi-agent.md`
- **Last updated:** 2026-07-31
- **Implementation:** Tasks 00–03 complete; Task 04 is the next implementation gate

## Agents and workstreams

- Lead `/root`: security, tenancy, operations, target synthesis, decisions, risks, migration, backlog.
- Agent A `/root/repo_execution`: repository and 15 execution paths (`workstreams/agent-a-repository-execution.md`).
- Agent B `/root/workflow_infra`: workflow state, batches, persistence, assets, workers, publishing (`workstreams/agent-b-workflow-infrastructure.md`).
- Agent C `/root/api_contract`: strategies, resources, `/v1`, async contract, product boundary (`workstreams/agent-c-api-contract.md`).

## Completed analyses

Repository/apps/packages and entry points; all 15 required operation paths; duplicate implementations; strategy scoring; target components; `/v1` resources/commands/errors/pagination/versioning; async jobs, cancellation/retry/resume/partial success; publication idempotency; persistence/assets; auth/tenancy/threat model; events/webhooks; observability/audit; quotas/metering; testing/deployment; migration/MVP; decisions/risks/backlog.

## Incomplete analyses

Live/provider/runtime verification was intentionally not performed. Gaps: real generated-layout prevalence, remote render deployment/network behavior, live provider-batch reconciliation, YouTube resumable-session recovery/marker semantics, end-to-end mathematics Short publishing, and full canonical Dark Truth execution.

## Verified findings

- `apps/api` is a request-agnostic placeholder that returns the local workspace path.
- The generic typed workflow engine is reusable; canonical math bindings prove feasibility.
- Dark Truth generic tasks are unbound and imperative/specialized paths diverge.
- Multiple writable file workflow/batch authorities exist; SQLite stores only episode JSON.
- No platform auth, tenancy, durable queue, object storage, OpenAPI, or outbox exists.
- Active YouTube upload can crash after provider acceptance and before durable video-ID evidence.

## Unresolved questions

Canonical Dark Truth path; first pilot profile; database and offline CLI policy; OIDC provider/API-key policy; tenant isolation tier; customer/platform YouTube OAuth ownership; private-first publishing; provider recovery guarantees; retention/residency/RTO/RPO; pilot quotas and billing rules.

## Evidence-gated decisions

Task 02 must prove YouTube resumable-session and recovery-marker semantics before publication implementation. Signed webhooks, object storage, OIDC, tenancy, quotas, and disaster-recovery controls remain gates for their named roadmap phases; no unsupported capability is approved for external use.

## Documents produced

All 22 numbered plan documents, five ADRs, seven Mermaid diagrams, this status, README index, and three workstream evidence files under `docs/api-plan/`.

## Validation commands executed

```text
PASS  ./scripts/validate-api-plan.sh
PASS  git diff --check -- docs/api-plan
PASS  pnpm exec prettier --check "docs/api-plan/**/*.md"
```

The initial combined Markdown/Mermaid Prettier check was corrected because Prettier has no configured `.mmd` parser. No tests or provider calls were run for this documentation-only task.

## Instruction conflict

`AGENTS.md` asks every file-modifying task to add `docs/reports/codex-runs/...`; the planning prompt permits writes only under `docs/api-plan/`. The narrower boundary was followed, so no report outside this directory was created. No AI context pack was changed.

## Next task

Implement relational workflow state and guarded transitions for API-managed resources.
