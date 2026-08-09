# YSAAS implementation progress

Current wave: Wave 2 in progress (YSAAS-012 complete; YSAAS-015 next)

## Anti-stuck execution rules (session)

- Finish and commit one YSAAS task before starting the next.
- Prefer `git show <commit>:path` + shell extraction over parallel multi-file `Write` batches.
- One `pnpm test:focused -- <file>` per shell invocation; no chained acceptance runs.
- Keep file reads narrow (line limits); avoid repo-wide greps with `**/*` globs.
- If a focused test fails twice after targeted fixes, record blocker and continue queue only when dependency graph allows skipping.

## Ledger

### YSAAS-001
Status: completed
Commit: dfaa182
Validation: domain + persistence unit tests pass; package typechecks pass
Notes: ProductionRevision, EpisodeProductionState projection, migration registry

### YSAAS-004
Status: completed
Commit: bc82308
Validation: SDK registry unit test pass; web saas-runtime unit test pass; OpenAPI/contract API tests blocked by pre-existing dark-truth vitest resolution (not introduced by this task)
Notes: Modular OpenAPI path modules, SDK operation modules, web gateway/page registries

### YSAAS-002
Status: completed
Commit: 3214f7b
Validation: capability-configuration unit test pass (6); domain typecheck pass
Notes: Layered capability/config contracts, resolver with provenance, admission evaluator with typed rejections

### YSAAS-003
Status: completed
Commit: 4316c6e
Validation: command-security unit test pass (8); domain/application/persistence typecheck pass
Notes: Membership/action grants, idempotency replay model, audit envelope, principal-directory migration registry

### YSAAS-005
Status: completed
Commit: 96270b5
Validation: `workflow-portfolio.unit.test.ts` pass (6); `workflow-portfolio-repository.unit.test.ts` pass (2); `pnpm exec tsc -p packages/persistence` pass; `apps/api` typecheck pass excluding pre-existing `job-process` / `provider-free-worker-entry` migrate errors
Notes: Portfolio filter contracts, recovery classifier, projector, persistence SQL source query + row mapper, `GET /v1/workspaces/{workspace}/workflow-portfolio` API/SDK route; resume/cancel/abandon actions reference existing workflow commands

### YSAAS-006
Status: completed
Commit: 50272db
Validation: `artifact-invalidation.unit.test.ts` pass (4); domain emit pass; `apps/api` postgres use-case typecheck pass
Notes: Production-unit graph, invalidation preview, gate evidence; API preview + regeneration routes; persistence unit loader and selective workflow execution deferred

### YSAAS-010
Status: completed
Commit: cfaffb0
Validation: `usage-quota.unit.test.ts` pass (10); domain/persistence emit pass; `apps/api` typecheck pass for new quota/health routes
Notes: Usage dimensions, reservation lifecycle, estimate projection with cache/reuse, provider health resolver; enriched quota dimensions, usage filters, `GET /v1/workspaces/{workspace}/provider-health`

### YSAAS-011
Status: completed
Commit: 639a9a4
Validation: `api-credential-lifecycle.unit.test.ts` pass (4); domain/application/persistence/api-sdk emit pass; `apps/api` typecheck pass excluding pre-existing `job-process` / `provider-free-worker-entry` migrate errors
Notes: Named credential lifecycle, show-once issue with idempotency replay, revoke with If-Match, developer journey examples; API routes + OpenAPI/SDK developer-credential module; pilot key admin `name` env; rotate overlap persistence (no public rotate route yet)

### YSAAS-012
Status: completed
Commit: 2c96364
Validation: `webhook-lifecycle.unit.test.ts` pass (4); domain/persistence/application/api-sdk emit pass; `apps/api` typecheck pass excluding pre-existing `job-process` / `provider-free-worker-entry` migrate errors
Notes: Webhook endpoint CRUD, show-once secret create/rotate with overlap, test delivery, delivery history with redacted summaries, attempt listing, resend replay; encrypted signing-secret store; OpenAPI/SDK webhook module; `webhook.manage` permission
