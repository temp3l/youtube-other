# Implement Horror Storytelling Strategy Task 08

Implement Task 08 from
`todo-prompts/horror-storytelling-strategy/08-controlled-evaluation-rollout-and-final-audit.md`.

Tasks 01–07 are already implemented in the current uncommitted worktree.
Preserve those changes and every unrelated user change. Follow `AGENTS.md`,
`packages/story-localization/AGENTS.md`, and the task-folder `README.md`
exactly. Current commit: `f29a43c`; all horror-strategy work remains
uncommitted.

Before editing, inspect:

- the Task 08 prompt and task-folder README;
- `docs/plans/research-informed-horror-storytelling-plan.md`;
- `docs/ai-context/context-pack.md`;
- relevant package instructions;
- the Task 01–07 implementation reports;
- the Task 03 calibration corpus, manifest, blind-assignment, rubric,
  aggregation, and tests;
- rollout configuration, persistence, resume, inspection, cache, workflow,
  status, cost, telemetry, and report code;
- current full, Short, localization, Analysis V2, repair-routing, batch, and
  validation implementations and focused tests.

Treat source code as authoritative. Implement only Task 08. Reuse existing
configuration, persistence, workflow, cost, telemetry, report, and calibration
architecture. Do not create parallel evaluation or rollout systems.

Do not silently choose unresolved product decisions. No approved primary
production metric, practical improvement threshold, production episode sample,
analytics authority, or permission to change the default rollout mode exists.
Represent missing decisions explicitly and fail closed to `remain-shadow`.
Synthetic fixtures may exercise schemas and decision rules but must not be
presented as production evidence.

Required behavior:

- Add a versioned evaluation manifest that is persisted before outcome
  inspection and requires the primary metric, practical threshold, sample,
  exclusions, stratification, strategy versions, cost budget, and decision
  rule.
- Keep full-story and Short evaluation separate.
- Preserve deterministic seeded blind assignment and non-secret rater
  provenance.
- Accept only explicitly imported, already-authorized aggregate audience
  metrics. Never fetch YouTube data.
- Treat normalized retention, early retention, average percentage viewed, and
  ending retention as story outcomes. Treat CTR as title/thumbnail evidence
  unless controlled.
- Enforce minimum sample requirements for stratification and label exploratory
  results.
- Produce a versioned decision artifact supporting `remain-shadow`, scoped
  `promote-to-enforce`, or `return-to-off`, including confidence, regressions,
  cost, failures, stale-cache behavior, and dissenting evidence.
- Promotion must require every source-plan gate and explicit human approval.
  Missing approval or unresolved product decisions must remain shadow.
- Rollback must be configuration-only, preserve diagnostics, and never rewrite
  accepted stories.
- Perform a source-backed final contract audit covering full, Short, localized,
  sync/batch, resume, inspection, Analysis V2, and repair paths.
- Add no provider call, unbounded loop, production analytics call, upload,
  publication, fixture regeneration, generated-asset modification, or Task 09
  work.

Task 07’s focused routing, repair prompt/service checks, and final
story-localization typecheck passed. Do not rerun old task suites broadly. Run
only narrowly affected Task 08 tests: directly affected manifest/assignment
tests first, then exact metric/decision/approval/rollback tests. Use
synthetic/import fixtures and mocked adapters only. Stay within the repository
verification budget: at most three focused test commands and, only after they
pass, one affected-package typecheck if source changes require it. Do not run
broad tests, builds, lint, snapshot updates, or fixture regeneration.

Update relevant behavior/configuration/architecture docs only when necessary.
Create or update:

- `docs/reports/codex-runs/2026-07-24-controlled-evaluation-rollout-final-audit.md`
- `docs/reports/2026-07-24/research-informed-horror-storytelling-plan-implementation-report.md`

Both reports must remain under 200 words and record changed paths, exact
checks/results, commit hash, risks, incomplete work, and deviations. The final
implementation report must accurately mark Tasks 01–08 and must not claim
production evaluation, human comparison, analytics authorization, or rollout
promotion unless those actually occurred.

Stop after Task 08.
