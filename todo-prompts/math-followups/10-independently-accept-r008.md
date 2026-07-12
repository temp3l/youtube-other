# Recommended next prompt: independently accept R-008

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md,
docs/mathe/plans/math-genre-implementation-plan.md,
docs/mathe/plans/math-genre-test-matrix.md,
docs/reports/codex-runs/2026-07-13-math-r007-third-acceptance-review.md,
docs/reports/codex-runs/2026-07-13-math-r008-fail-closed-quality-cli.md,
and docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md.

Inspect Git state first. Baseline is ac21261; expected HEAD is
ab9a32a7d880e3234b33f10b41e1a95917a195d3, but Git is authoritative. Preserve
all tracked and untracked changes, especially .tmp/mock-openai-server.mjs and
the uncommitted R-008 implementation, tests, and reports. Do not clean, reset,
commit, regenerate fixtures, modify generated episode assets, edit generated
dist files, or revert accepted R-001 through R-007 work.

R-007 is accepted. R-008 is implemented dated 2026-07-13 and pending
independent acceptance. Independently review R-008 for acceptance only. Do not
repair production or test code in this task. If a material defect is found,
keep R-008 pending and document the exact blocker. Do not start R-009.

Inspect current source and matching tests before deciding, especially:

- packages/math-education/src/orchestration/quality-gate.ts
- packages/math-education/src/orchestration/artifact-schemas.ts
- packages/math-education/src/orchestration/workflow.ts
- packages/math-education/src/orchestration/pilot-simulation.ts
- packages/math-education/src/domain/artifacts.ts
- packages/math-education/src/orchestration/math-pipeline.unit.test.ts
- packages/math-education/src/orchestration/quality-gate.unit.test.ts
- apps/cli/src/math-commands.ts
- apps/cli/src/math-commands.unit.test.ts

Treat source as authoritative. Re-audit the complete material R-008 contract,
including adversarial paths not merely the happy-path assertions.

1. Complete versioned evidence and derived status

- Confirm one authoritative, versioned required-check contract rejects empty,
  missing, duplicate, unknown, malformed, and contradictory checks without
  depending on array order.
- Confirm report parsing independently rejects caller-injected status,
  blockers, selected scope, render/final-media/publish permissions, hashes,
  inline evidence, publishable flags, and approval booleans.
- Verify the full priority order:
  MATHEMATICAL_ERROR > CURRICULUM_ERROR > LOCALIZATION_ERROR > TIMING_ERROR >
  RENDER_BLOCKED > PUBLISH_BLOCKED > REVISION_REQUIRED >
  READY_WITH_MINOR_EDITS > READY. Check pairwise conflicts, each individual
  status, and READY.
- Confirm skipped, missing, failed, corrupt, hash-invalid, non-ready audio,
  render, media-QA packet, or final-media evidence becomes RENDER_BLOCKED.
  READY must require every upstream and final-media gate; placeholders and
  skipped workflow stages must never become ready or publishable.
- Confirm locale assessment uses exactly the selected scope: a valid one-locale
  run succeeds, while a missing selected locale blocks. Reject duplicate,
  outside-scope, or contradictory assessed-locale evidence.
- Inspect whether retained `math-quality.v1` compatibility can enter any
  current quality, render, status, or publish permission path. Accept only if
  legacy caller-supplied status/publishable data cannot authorize current
  behavior and is safely rejected or quarantined at every R-008 boundary.

2. Render and publish permissions

- Confirm mathematics, curriculum, localization, and timing failures all
  block render preflight before media work. Confirm final-media readiness is
  modeled separately without creating a circular render requirement.
- Confirm every non-publishable status blocks publish and READY requires a
  complete schema-/hash-valid, workflow-owned quality artifact.
- Trace quality, approval, publish-packet, and manifest loading through the
  R-004 lineage model. Missing, corrupt, stale, swapped, wrong-parent,
  wrong-producer, duplicate-lineage, identity-mismatched, or hash-mismatched
  artifacts must fail closed before dispatch.
- Confirm the math publish surface remains dry-run-only and does not dispatch.
  No story/horror fallback, remote renderer, paid provider, network dispatch,
  external media service, or publish action may have been added.

3. Versioned minor-edit approval

- Confirm approval is a strict versioned artifact bound to the exact lesson,
  workflow-owned quality path, quality artifact content hash, and quality input
  hash, with deterministic decision, reviewer identities, and timestamps.
- Confirm a genuine second reviewer is required. Reject self-review, duplicate
  identity, missing identity, stale or mismatched hash/path/lesson, malformed
  timestamps, reversed timestamps, wrong decision, unknown fields, and wrong
  version.
- Confirm approval applies only to READY_WITH_MINOR_EDITS, never mutates the
  derived status, and cannot override mathematical or any other blocking/error
  status. Confirm a caller cannot supply an unbound inline approval.

4. CLI and workflow outcomes

- Confirm `math quality check`, `math status`, production status/inspect, and
  the relevant publish dry-run path load strict workflow-owned artifacts rather
  than arbitrary JSON.
- Confirm outputs report derived status, blockers, selected locale scope,
  approval result, render preflight, final-media readiness, and publish
  permission without a status-setting CLI option.
- Verify exit 0 for all selected ready targets, 1 for invalid input/config or
  artifact/manifest/schema/hash failure, 2 only for a genuinely mixed
  multi-target selection, and 3 when every selected target is blocked/failed.
  A blocked single target must return 3. Inspect Commander error propagation
  and variadic `--lesson` parsing so the process actually exposes those codes.
- Confirm pilot simulation and resume read authoritative v2 quality evidence,
  a one-locale simulation does not fail for unselected locales, and skipped
  audio/render/media remains RENDER_BLOCKED.
- Confirm existing story/horror registrations, defaults, and exit behavior
  were not modified.

Do not weaken assertions, update snapshots, regenerate fixtures, or broaden
verification. Classify any failure before suggesting a repair. Do not modify
production code, tests, fixtures, or generated assets during this acceptance
task.

Run only these checks, in order:

1. pnpm test:focused -- packages/math-education/src/orchestration/quality-gate.unit.test.ts
2. pnpm test:focused -- apps/cli/src/math-commands.unit.test.ts
3. pnpm --filter @mediaforge/math-education --filter @mediaforge/cli typecheck

The final typecheck must be run against the current final R-008 worktree; the
implementation report explicitly records that its last small delta was not
covered by the prior typecheck. Stay within the AGENTS.md verification budget.
Do not run R-007 render integration, the 180-second production render,
repository-wide tests, builds, snapshot updates, fixture regeneration,
provider/network commands, or publish.

Issue an explicit accept or reject decision. Accept only if source review and
fresh checks establish the complete R-008 contract. If accepted, mark R-008
accepted dated 2026-07-13 but do not start R-009. If rejected, keep R-008
pending and report the exact defect, attack or evidence gap, owning module,
and smallest follow-up repair.

Update only:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- a new report at
  docs/reports/codex-runs/2026-07-13-math-r008-independent-acceptance-review.md

Keep reports under 200 words. Report exact changed paths, exact checks/results,
current commit hash, decision, remaining risks, deviations, and anything not
verified. Do not commit.
```
