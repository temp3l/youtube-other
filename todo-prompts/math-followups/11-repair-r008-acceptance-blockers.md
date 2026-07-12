# Recommended next prompt: repair R-008 acceptance blockers

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md,
docs/mathe/plans/math-genre-implementation-plan.md,
docs/mathe/plans/math-genre-test-matrix.md,
docs/reports/codex-runs/2026-07-13-math-r008-fail-closed-quality-cli.md,
docs/reports/codex-runs/2026-07-13-math-r008-independent-acceptance-review.md,
and docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md.

Inspect Git state first. Baseline is ac21261; expected HEAD is
ab9a32a7d880e3234b33f10b41e1a95917a195d3, but Git is authoritative. Preserve
all tracked and untracked changes, especially .tmp/mock-openai-server.mjs,
packages/educational-renderer/, todo-prompts/linux-math-video-rendering/, and
the uncommitted R-008 implementation and acceptance documentation. Do not
clean, reset, commit, regenerate fixtures, modify generated episode assets,
edit generated dist files, or revert accepted R-001 through R-007 work.

R-007 is accepted. R-008 was rejected in independent acceptance on 2026-07-13
and remains pending repair. Repair only the documented R-008 blockers as one
tightly coupled batch. Do not accept R-008 in this task and do not start R-009.

Inspect the current source and matching tests before editing, especially:

- packages/math-education/src/orchestration/workflow.ts
- packages/math-education/src/orchestration/workflow-store.unit.test.ts
- packages/math-education/src/orchestration/pilot-simulation.ts
- packages/math-education/src/orchestration/artifact-schemas.ts
- apps/cli/src/math-commands.ts
- apps/cli/src/math-commands.unit.test.ts
- apps/cli/src/index.ts
- apps/cli/src/index-setup.unit.test.ts

Treat source as authoritative. Reuse the R-004 workflow/artifact-lineage model;
do not add a parallel provenance store or trust caller-supplied identity,
status, publishability, approval, or exit-code data.

Repair the complete blocker batch:

1. Bind authoritative reads to the manifest stage chain

- A stage record must not validate only against its own declared parents.
  Validate the manifest's current v2 stage chain so every stage is present
  exactly once in canonical order and every non-root stage's parent
  fingerprints are exactly bound to the authoritative preceding stage
  fingerprint expected by the current linear workflow.
- Require every output lineage parent list to match that validated stage
  parent list exactly, with no missing, extra, duplicated, reordered, or
  self-declared alternative parents.
- Keep existing stage status, producer, schema version, contained regular-file,
  content-hash, and exactly-one-owned-output checks fail-closed.
- Reject transplanted stage records, artifacts, lineage, or complete suffixes
  from another lesson/manifest even when each transplanted object is internally
  hash-consistent. Do not make legacy v1 artifacts reusable.
- Apply the repaired authoritative boundary consistently to quality, minor-edit
  approval, publish packet, pilot resume, and provider-free media readers. Do
  not weaken already accepted R-004 or R-007 provenance checks.

2. Bind payload identity to the requested target

- `authoritativeQuality(workspace, lessonId)` must require the loaded v2 report
  lesson ID to equal both the requested lesson and manifest lesson before any
  status, render, approval, or publish permission is returned.
- A minor-edit approval must remain bound to that same authoritative quality
  artifact, lesson, path, input hash, and content hash. A swapped approval must
  fail closed.
- The publish dry-run reader must require packet lesson ID to equal the
  requested/manifest lesson, packet language to equal the requested language,
  the requested language to be in the quality report's selected locale scope,
  and the packet path/lineage to belong to that same locale and manifest.
- Reject cross-lesson, cross-language, wrong-path, wrong-parent, wrong-producer,
  duplicate-lineage, and otherwise identity-mismatched packets before output.
- Preserve dry-run-only publishing. Do not add dispatch, network access, a paid
  provider, remote rendering, an external media service, or a story/horror
  fallback.

3. Preserve semantic CLI exit outcomes through the real entrypoint

- A valid but blocked math publish dry run must terminate with exit 3, not be
  rewritten to exit 1 by the top-level catch. Telemetry must record the same
  final semantic exit code.
- Invalid input, manifest, schema, hash, lineage, or identity remains exit 1.
  Preserve exit 0 for success and exit 2 only for a genuinely mixed multi-item
  selection.
- Do not preserve arbitrary ambient `process.exitCode` values. Use an explicit,
  typed/classified error or equally deterministic mechanism so only known math
  semantic failures retain exit 3 through top-level handling.
- Preserve existing story/horror command registrations and their error/exit
  behavior.

Add focused semantic and adversarial tests that would have caught the review
findings. Cover at minimum:

- a valid authoritative chain and exact owned output;
- duplicate/missing/reordered stages and missing/extra/duplicate/reordered
  parent fingerprints;
- a transplanted READY quality report plus quality stage record from another
  lesson, including an internally consistent swapped suffix;
- report lesson ID differing from requested or manifest lesson;
- swapped/stale approval identity;
- publish packet lesson, language, locale path, producer, parent, and selected
  scope mismatches;
- blocked publish returning process exit 3 through the actual top-level catch
  and telemetry finalization;
- invalid authoritative data returning 1, without changing existing 0/2/3
  quality-selection coverage or unrelated CLI behavior.

Prefer small human-readable test builders over fixture regeneration. Do not
weaken assertions, update snapshots, or broaden the production contract beyond
these blockers. Classify any fixture failure before editing it; only change a
fixture for this intentional R-008 repair.

Run only these checks, in order, placing new cases in the directly affected
existing files where practical:

1. pnpm test:focused -- packages/math-education/src/orchestration/workflow-store.unit.test.ts
2. pnpm test:focused -- apps/cli/src/math-commands.unit.test.ts apps/cli/src/index-setup.unit.test.ts
3. pnpm --filter @mediaforge/math-education --filter @mediaforge/cli typecheck

Confirm the focused-test wrapper honors both CLI file arguments before trusting
the second result; if it does not, use one direct filtered Vitest invocation
covering both files instead. Stay within the AGENTS.md verification budget. Do
not run R-007 render integration, the 180-second production render,
repository-wide tests, builds, snapshot updates, fixture regeneration,
provider/network commands, or publish.

After repair and passing focused checks, keep R-008 implemented and pending a
new independent acceptance dated 2026-07-13. Do not mark it accepted and do not
start R-009. Update only relevant production/tests plus:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- a new report at
  docs/reports/codex-runs/2026-07-13-math-r008-acceptance-blocker-repair.md

Keep reports under 200 words. Report exact changed paths, exact checks/results,
current commit hash, remaining risks, deviations, and anything not verified.
Do not commit.
```
