# Recommended next prompt: implement R-008 fail-closed quality and CLI outcomes

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md,
docs/mathe/plans/math-genre-implementation-plan.md,
docs/mathe/plans/math-genre-test-matrix.md,
docs/reports/codex-runs/2026-07-13-math-r007-third-acceptance-review.md,
and docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md.

Inspect Git state first. Baseline is ac21261; expected HEAD is
1bd66d4e302ac8795110b6606d3249c373a89095, but Git is authoritative. Preserve
all tracked and untracked changes, especially .tmp/mock-openai-server.mjs and
the uncommitted R-007 acceptance documentation. Do not clean, reset, commit,
regenerate fixtures, modify generated episode assets, edit generated dist
files, or revert accepted R-001 through R-007 work.

R-007 is accepted dated 2026-07-13. Implement R-008 only: make math quality,
render/publish permissions, status reporting, and CLI outcomes strictly
fail-closed. Do not independently accept R-008 in the same task and do not
start R-009.

Inspect the current source and matching tests before editing, especially:

- packages/math-education/src/orchestration/quality-gate.ts
- packages/math-education/src/orchestration/artifact-schemas.ts
- packages/math-education/src/orchestration/workflow.ts
- packages/math-education/src/orchestration/pilot-simulation.ts
- packages/math-education/src/domain/artifacts.ts
- packages/math-education/src/orchestration/math-pipeline.unit.test.ts
- apps/cli/src/math-commands.ts
- apps/cli/src/math-commands.unit.test.ts

Treat source as authoritative. Reuse the R-004 workflow/artifact-lineage model;
do not create a parallel mutable status store. Keep schemas strict and derive
status and permissions from validated evidence, never caller-supplied status,
publishable booleans, or an unbound approval flag.

Implement the complete material R-008 contract:

1. Complete, versioned quality evidence

- Define the required gate/check set and its version in one authoritative
  contract. A quality evaluation must reject an empty set, a missing required
  check, duplicate check IDs, unknown check IDs, malformed checks, or
  contradictory pass/status data.
- Derive the final status with the documented priority:
  MATHEMATICAL_ERROR > CURRICULUM_ERROR > LOCALIZATION_ERROR > TIMING_ERROR >
  RENDER_BLOCKED > PUBLISH_BLOCKED > REVISION_REQUIRED >
  READY_WITH_MINOR_EDITS > READY.
- A skipped, missing, corrupt, hash-invalid, or non-ready audio/render/media-QA
  result must produce RENDER_BLOCKED. READY requires validated final media and
  every required upstream gate. Do not allow placeholders or skipped stages to
  become READY or publishable.
- Assess the explicitly selected locale scope. A valid one-locale run must not
  fail merely because the other four locales were not selected; a missing
  locale inside the selected scope must block.

2. Render and publish permissions

- Replace the current render guard that blocks only MATHEMATICAL_ERROR. Every
  upstream curriculum, mathematics, localization, and timing failure must
  block render before media work. Model render-preflight and final-media
  readiness separately if necessary to avoid a circular requirement.
- Publish remains allowed only from a complete, schema-/hash-valid quality
  artifact whose derived result is publishable. Missing/corrupt/stale evidence
  or any blocking status must fail closed before dispatch.
- Preserve R-007 provider-free rendering and media QA. Do not add a story or
  horror fallback, remote renderer, paid provider, network dispatch, external
  media service, or publish action.

3. Versioned minor-edit approval

- Replace the free `approvedMinorEdits` boolean with a strict versioned
  approval artifact bound to the exact quality input/artifact identity and
  content hash, decision, reviewer identities, and timestamps/version needed
  for deterministic validation.
- Enforce a genuine second reviewer according to the existing review model;
  reject self-review, duplicate reviewer identity, stale/hash-mismatched,
  malformed, wrong-decision, or wrong-version approvals.
- Approval may make READY_WITH_MINOR_EDITS publishable only. It must never
  override MATHEMATICAL_ERROR or any other blocking/error status and must not
  mutate the derived status.

4. CLI quality and status outcomes

- Make `math quality check` and relevant math status/production surfaces load
  strict workflow-owned, schema-/hash-valid artifacts rather than printing
  arbitrary JSON.
- Return documented machine-readable exit outcomes: 0 when the selected goal
  is ready/successful, 1 for invalid input/configuration/artifact shape, 2 for
  a genuinely partial multi-item selection, and 3 when all selected items are
  blocked or failed. A blocked single quality target must be nonzero.
- Ensure human/JSON output reports the derived status, blockers, selected
  scope, approval result, and permission decisions without allowing a CLI flag
  to set status directly.
- Preserve existing story/horror commands, defaults, exit behavior, and CLI
  registrations.

Add or strengthen focused semantic tests. Cover at minimum:

- the full status-priority matrix and each individual status;
- empty, missing, duplicate, unknown, contradictory, and reordered checks;
- skipped/missing/corrupt audio, render, final-media validation, and packet or
  corruption evidence producing RENDER_BLOCKED;
- selected one-locale success and missing-selected-locale failure;
- every upstream failure blocking render and every non-publishable outcome
  blocking publish;
- valid second-reviewer minor approval plus self-review, duplicate reviewer,
  stale hash, wrong identity/version/decision, and mathematical-error attacks;
- CLI exit 0/1/2/3, including a blocked single target and mixed selection;
- strict authoritative artifact loading and attempts to inject status,
  publishable, inline evidence, or approval booleans.

Do not weaken assertions, update snapshots, regenerate fixtures, or broaden
verification. Classify any fixture failure before editing it; only change a
fixture for an intentional R-008 contract change, and keep such changes small
and human-readable.

Run only these checks, in order, adapting the first path only if the focused
R-008 tests are placed in an already existing directly affected test file:

1. pnpm test:focused -- packages/math-education/src/orchestration/quality-gate.unit.test.ts
2. pnpm test:focused -- apps/cli/src/math-commands.unit.test.ts
3. pnpm --filter @mediaforge/math-education --filter @mediaforge/cli typecheck

Stay within the AGENTS.md verification budget. Do not run the R-007 render
integration, the 180-second production render, repository-wide tests, builds,
snapshot updates, fixture regeneration, provider/network commands, or publish.

When implementation and focused checks pass, mark R-008 implemented and
pending independent acceptance dated 2026-07-13. Do not mark it accepted and
do not start R-009. Update only relevant production/tests plus:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- a new report at
  docs/reports/codex-runs/2026-07-13-math-r008-fail-closed-quality-cli.md

Keep reports under 200 words. Report exact changed paths, exact checks/results,
current commit hash, remaining risks, deviations, and anything not verified.
Do not commit.
```
