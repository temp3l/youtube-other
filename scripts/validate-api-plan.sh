#!/usr/bin/env bash
set -euo pipefail

BASE="docs/api-plan"

required=(
  README.md
  01-current-architecture.md
  02-execution-path-analysis.md
  03-duplication-and-divergence.md
  04-strategy-comparison.md
  05-target-architecture.md
  06-api-resource-model.md
  07-api-contract-v1.md
  08-job-and-workflow-model.md
  09-idempotency-and-concurrency.md
  10-persistence-and-assets.md
  11-auth-authorization-tenancy.md
  12-security-threat-model.md
  13-events-and-webhooks.md
  14-observability-and-audit.md
  15-rate-limits-quotas-metering.md
  16-testing-strategy.md
  17-deployment-topology.md
  18-migration-roadmap.md
  19-api-mvp.md
  20-decision-register.md
  21-risk-register.md
  22-implementation-backlog.md
  PLAN-STATUS.md
  decisions/ADR-API-001-shared-application-layer.md
  decisions/ADR-API-002-rest-openapi.md
  decisions/ADR-API-003-asynchronous-workflows.md
  decisions/ADR-API-004-workflow-persistence.md
  decisions/ADR-API-005-authentication-and-tenancy.md
  diagrams/current-context.mmd
  diagrams/execution-paths.mmd
  diagrams/target-context.mmd
  diagrams/target-components.mmd
  diagrams/workflow-sequence.mmd
  diagrams/publishing-idempotency-sequence.mmd
  diagrams/deployment-topology.mmd
)

missing=0
for file in "${required[@]}"; do
  if [[ ! -s "$BASE/$file" ]]; then
    printf 'MISSING OR EMPTY: %s\n' "$BASE/$file"
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo
  echo "API planning package is incomplete."
  exit 1
fi

echo "API planning package contains all required non-empty files."
