# Post-refactor mathematics remediation backlog v2

Source audit: `docs/mathe/audits/post-refactor-implementation-audit.md`  
Task pack: `todo-prompts/math-2/`

No item authorizes a paid provider, live upload, playlist mutation, or public
publishing. Source and fresh focused evidence override historical A/R status.

## Dependency map

| Task   | Current state                                      | Dependencies                                              | Evidence/gate                                                                          |
| ------ | -------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| M2-001 | Complete in this audit                             | None                                                      | Refreshed audit, backlog, prompts, report.                                             |
| M2-002 | Ready; Critical                                    | M2-001                                                    | All 18 canonical task handlers are unbound; legacy run/resume is simulation-backed.    |
| M2-003 | Human/external gate may start                      | M2-001                                                    | 37 Class-5 skills exist, but release/provenance/DAG remain draft/incomplete.           |
| M2-004 | Ready after M2-003 review contract/scope is stable | M2-001, stable M2-003 scope; integrate after M2-002       | `M5-ZO-001..016`; only `M5-ZO-001` has a simulation fixture.                           |
| M2-005 | Same as M2-004                                     | M2-001, stable M2-003 scope; integrate after M2-002       | `M5-ZO-017..024` have no production lesson specifications.                             |
| M2-006 | Same as M2-004                                     | M2-001, stable M2-003 scope; integrate after M2-002       | Only `M5-GM-002` has a simulation fixture.                                             |
| M2-007 | Same as M2-004                                     | M2-001, stable M2-003 scope; integrate after M2-002       | Only `M5-DZ-001` has a simulation fixture.                                             |
| M2-008 | Blocked for acceptance                             | M2-002; representative accepted contracts from M2-004–007 | Canonical speech/render/media/metadata tasks are unbound; renderer evidence not fresh. |
| M2-009 | Blocked                                            | M2-003–M2-008 accepted                                    | No canonical three-skill private pilot exists.                                         |
| M2-010 | Blocked                                            | M2-009 accepted and explicit paid-call approval if needed | 37-item private batch is not ready.                                                    |
| M2-011 | Blocked                                            | M2-010 complete                                           | Independent review requires actual batch artifacts.                                    |

M2-002 and M2-003 may proceed in parallel. M2-004–M2-007 may also proceed in
separate worktrees after the review contract and exact rollout scope from
M2-003 are stable; their production/canonical acceptance waits for M2-002.

## M2-001 — Refresh the post-refactor audit

Status: **complete, adversarial self-audit; no independent product acceptance**.

- Evidence: current audit and three focused green test files.
- Output: this backlog and the refreshed audit.
- Remaining risk: no broad or independent release gate was run.

## M2-002 — Implement canonical production workflow adapters

Status: **ready; Critical**.

- Findings: M2-F001, M2-F003, M2-F004, M2-F005, M2-F006, M2-F007.
- Current evidence:
  - packaged lesson graph reports 18/18 `implementationBound:false`;
  - `createOperator` passes `{}` to `createMathTaskRegistrations`;
  - `ProductionTaskCallerAdapter.invoke` invokes the original callback;
  - legacy `math production run|resume` calls `runPilotSimulation`;
  - offline setup checks verifier `2.0.0` while current source is `3.0.0`.
- Required outcome: one real owner adapter per executable task through publish
  dry-run, canonical artifacts/state/cache only, authoritative readiness, and
  legacy production commands projected through `WorkflowOperator`.
- Safety: simulation stays an explicit fixture; provider work remains
  authorization-gated; live math publish remains unbound/unavailable.
- Matching prompt: `todo-prompts/math-2/02-production-workflow-adapters.md`.

## M2-003 — Establish a reviewed Class-5 curriculum release

Status: **`HUMAN_OR_EXTERNAL_BLOCKER` until exact review evidence exists**.

- Finding: M2-F002 and the release-authority part of M2-F004.
- Current evidence: `readyForProduction:false`, 206 incomplete mappings, 19
  reviewed edges, zero overrides, draft release, and no 37-skill approval.
- Required outcome: a hash-bound review packet and, only after actual approval,
  an append-only reviewed Class-5 release/scope. No state/school/jurisdiction
  claim may be inferred.
- Matching prompt: `todo-prompts/math-2/03-reviewed-class5-curriculum-release.md`.

## M2-004 — Implement Class-5 number/operations core

Status: **content work may start after M2-003 scope stability; canonical
acceptance waits for M2-002**.

- Evidence: target IDs are the first 16 current Class-5 records; only
  `M5-ZO-001` has fixture-backed simulation content.
- Required outcome: reviewed German standard specifications and independent
  exact checks for all 16 skills.
- Matching prompt: `todo-prompts/math-2/04-class5-number-operations-core.md`.

## M2-005 — Implement Class-5 fractions/decimals

Status: **same dependency rule as M2-004**.

- Evidence: `M5-ZO-017..024` exist in the curriculum but not in lesson
  capabilities/fixtures.
- Required outcome: eight reviewed exact rational/decimal specifications,
  deterministic speech, and semantic visuals.
- Matching prompt: `todo-prompts/math-2/05-class5-fractions-decimals.md`.

## M2-006 — Implement Class-5 geometry/measurement

Status: **same dependency rule as M2-004**.

- Evidence: the 11 target records exist; only `M5-GM-002` is an approved
  simulation fixture. Verifier v3 has more formula support, not the complete
  lesson/visual contract required by this scope.
- Required outcome: reviewed exact geometry/unit/relation/net/volume content and
  accessible semantic diagrams.
- Matching prompt: `todo-prompts/math-2/06-class5-geometry-measurement.md`.

## M2-007 — Implement Class-5 data/diagrams

Status: **same dependency rule as M2-004**.

- Evidence: both records exist; only `M5-DZ-001` has simulation content.
- Required outcome: two reviewed dataset-derived specifications and
  independently checked accessible diagrams.
- Matching prompt: `todo-prompts/math-2/07-class5-data-diagrams.md`.

## M2-008 — Finish production speech/render/media path

Status: **blocked for acceptance on M2-002 and representative M2-004–007
contracts**.

- Finding: M2-F005.
- Current evidence: speech, math-rendering, thumbnail and educational-renderer
  capabilities exist, but canonical tasks are unbound. Current chalk code/tests
  supersede the historical sample failure claim, but were not freshly executed.
- Required outcome: canonical mocked/provider-authorized speech, timing reflow,
  semantic visuals, render/media QA, metadata/thumbnail, and zero-mutation dry
  run with correct cache identity and placeholder policy.
- Matching prompt: `todo-prompts/math-2/08-production-speech-rendering.md`.

## M2-009 — Accept the three-skill private pilot

Status: **blocked on M2-003–M2-008**.

- Evidence: no current canonical operator artifacts exist for the three skills.
- Required outcome: provider-free, resumable, corruption-tested workflows
  through publish dry-run for number, geometry and data representatives.
- Matching prompt: `todo-prompts/math-2/09-three-skill-private-pilot.md`.

## M2-010 — Produce the 37-lesson private batch

Status: **blocked on M2-009 and current explicit provider authorization when
paid speech is required**.

- Required outcome: exactly 37 successful isolated canonical items, truthful
  cache/provider/cost evidence, private media, and zero remote mutation.
- Matching prompt: `todo-prompts/math-2/10-class5-private-batch.md`.

## M2-011 — Independent private-rollout acceptance

Status: **blocked on actual M2-010 artifacts**.

- Finding: M2-F008.
- Required outcome: fresh isolated reviewer context if available; otherwise
  label `ADVERSARIAL_SELF_REVIEW`. Never infer acceptance from implementation
  reports.
- Matching prompt: `todo-prompts/math-2/11-independent-acceptance.md`.
