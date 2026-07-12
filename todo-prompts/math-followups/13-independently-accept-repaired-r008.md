# Recommended next prompt: independently accept repaired R-008

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md,
docs/mathe/plans/math-genre-implementation-plan.md,
docs/mathe/plans/math-genre-test-matrix.md,
docs/reports/codex-runs/2026-07-13-math-r008-independent-acceptance-review.md,
docs/reports/codex-runs/2026-07-13-math-r008-acceptance-blocker-repair.md,
and docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md.

Inspect Git state first. Baseline is ac21261; expected HEAD is
ab9a32a7d880e3234b33f10b41e1a95917a195d3, but Git is authoritative. Preserve
all tracked and untracked changes, especially .tmp/mock-openai-server.mjs,
packages/educational-renderer/, todo-prompts/linux-math-video-rendering/, and
the uncommitted R-008 implementation, tests, rejection review, blocker repair,
and verification documentation. Do not clean, reset, commit, regenerate
fixtures, modify generated episode assets, edit generated dist files, change
pnpm-lock.yaml, or revert accepted R-001 through R-007 work.

R-007 is accepted. R-008 remains unaccepted. Its independent review rejected
the original implementation, the documented blockers were repaired on
2026-07-13, and the final focused repair checks are green. Perform a new,
separate independent acceptance of repaired R-008 only. Do not repair
production code or tests in this task. If any material defect or evidence gap
is found, reject R-008, keep it pending, and document the exact blocker. Do not
start or implement R-009.

Inspect current source and matching tests before running checks, especially:

- packages/math-education/src/orchestration/quality-gate.ts
- packages/math-education/src/orchestration/artifact-schemas.ts
- packages/math-education/src/orchestration/workflow.ts
- packages/math-education/src/orchestration/pilot-simulation.ts
- packages/math-education/src/orchestration/quality-gate.unit.test.ts
- packages/math-education/src/orchestration/workflow-store.unit.test.ts
- packages/math-education/src/orchestration/workflow-invalidation.unit.test.ts
- packages/math-education/src/orchestration/math-pipeline.unit.test.ts
- apps/cli/src/math-commands.ts
- apps/cli/src/math-commands.unit.test.ts
- apps/cli/src/index.ts
- apps/cli/src/index-setup.unit.test.ts

Treat source as authoritative. Independently re-audit the complete R-008
contract and the repaired attack paths rather than relying on the repair
report or existing assertions.

1. Strict quality derivation and permissions

- Confirm the versioned required-gate contract rejects empty, missing,
  duplicate, unknown, malformed, contradictory, and order-manipulated checks.
- Confirm status, blockers, selected locales, hashes, render/final-media/publish
  permissions, and approval outcomes are derived rather than caller-settable.
- Verify the complete priority order:
  MATHEMATICAL_ERROR > CURRICULUM_ERROR > LOCALIZATION_ERROR > TIMING_ERROR >
  RENDER_BLOCKED > PUBLISH_BLOCKED > REVISION_REQUIRED >
  READY_WITH_MINOR_EDITS > READY.
- Confirm missing, skipped, failed, corrupt, stale, or hash-invalid audio,
  render, media-QA, or final-media evidence blocks readiness and publishing.
- Confirm locale evidence matches exactly the selected scope and rejects
  missing, duplicate, outside-scope, or contradictory locale assessment.
- Confirm legacy quality v1 caller-supplied status/publishable fields cannot
  authorize any current render, status, quality, approval, or publish path.

2. Canonical workflow lineage and requested identity

- Confirm a v2 manifest contains every stage exactly once in canonical order
  and each stage is bound to the authoritative preceding fingerprint.
- Confirm each reusable output is schema-valid, hash-valid, contained,
  non-symlinked, owned by the declared producer, and bound to the exact stage
  parent fingerprints.
- Confirm authoritative reads require exactly one matching output and reject
  missing, duplicate, reordered, alternatively parented, swapped, transplanted,
  wrong-producer, wrong-path, wrong-schema, and suffix-transplant attacks.
- Trace requested lesson and locale identity through manifest, quality report,
  minor-edit approval, and publish dry-run packet. A valid artifact from another
  lesson or locale must never authorize the requested target.

3. Minor-edit approval and publish dry run

- Confirm approval is a strict versioned artifact bound to the exact lesson,
  workflow-owned quality path, quality content hash, and quality input hash.
- Reject self-review, duplicate/missing reviewer identity, stale/mismatched
  lesson/path/hash, malformed or reversed timestamps, wrong decision/version,
  unknown fields, and inline/unowned approval.
- Confirm approval applies only to READY_WITH_MINOR_EDITS, never changes the
  derived status, and cannot override any error or blocked status.
- Confirm publish remains dry-run-only, validates quality before requiring a
  packet, rejects packet identity/locale/path/producer/parent/duplicate/scope
  mismatches, and never dispatches a provider, network client, or upload.

4. Real CLI entrypoint and exit semantics

- Confirm `math quality check`, `math status`, production status/inspect, and
  publish dry run load only strict workflow-owned artifacts.
- Confirm exit 0 means all selected targets are ready, exit 2 means a genuinely
  mixed multi-target selection, exit 3 means every selected target is
  semantically blocked/failed, and exit 1 means invalid input/config/artifact.
- Inspect the real Commander registration. Root and child `--dry-run` handling
  must reach the actual math publish action; absence of `--dry-run` must fail
  closed, while a blocked publish with the flag must throw MathCliSemanticError.
- Confirm the real top-level catch and telemetry finalization both preserve
  classified exit 3. A generic error must ignore ambient process.exitCode = 3
  and finalize with exit 1.
- Confirm the real-entrypoint test imports the production math command and
  mocks only unrelated command registrations and observability. Do not accept
  a synthetic throw or file-level math-command mock as entrypoint evidence.
- Confirm story/horror registrations, defaults, and exit behavior remain
  unchanged.

Run only these checks, in order:

1. pnpm test:focused -- packages/math-education/src/orchestration/workflow-store.unit.test.ts
2. pnpm test:focused -- packages/math-education/src/orchestration/quality-gate.unit.test.ts
3. pnpm test:focused -- apps/cli/src/math-commands.unit.test.ts apps/cli/src/index-setup.unit.test.ts
4. pnpm --filter @mediaforge/math-education --filter @mediaforge/cli typecheck

The focused wrapper is known to forward the second CLI file into the same
Vitest invocation. Stay within the AGENTS.md verification budget. If a check
fails, classify it and stop; do not edit production, tests, fixtures, or
snapshots. Do not run render integration, the 180-second production render,
repository-wide tests, builds, lint, snapshot updates, fixture regeneration,
provider/network commands, or publish. If pnpm notices the preserved untracked
educational-renderer package, do not retain any pnpm-lock.yaml modification.

Issue an explicit accept or reject decision. Accept only if independent source
review and all fresh authorized checks establish the entire repaired R-008
contract. If accepted, mark R-008 accepted dated 2026-07-13 and leave R-009
unstarted. If rejected, keep R-008 pending and report the exact defect, attack
or evidence gap, owning module, and smallest follow-up repair.

Update only:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- a new report at
  docs/reports/codex-runs/2026-07-13-math-r008-repaired-independent-acceptance-review.md

Do not overwrite the earlier rejection review or blocker-repair report. Keep
reports under 200 words. Report exact changed paths, exact commands/results,
current commit hash, decision, remaining risks, deviations, and anything not
verified. Do not create any other report and do not commit.
```
