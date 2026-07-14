# M2-002: Implement canonical mathematics production workflow adapters

Implement the missing production task adapters that connect the mathematics profile DAG
to the canonical shared workflow engine. Do not expand curriculum content in this task.

## Dependency

Run only after M2-001 accepts this task as current. Read the refreshed audit and backlog,
then inspect current source before editing.

## Inspect first

- `packages/math-education/src/task-registry.ts`
- `packages/math-education/src/profile-bindings.ts`
- `packages/math-education/src/profile-store.ts`
- `packages/math-education/src/orchestration/`
- `python/math-verifier/{README.md,setup-offline.sh,requirements.lock,src/}`
- `packages/workflow-engine/src/`
- `apps/cli/src/workflow-commands.ts`
- `apps/cli/src/math-commands.ts`
- `apps/cli/src/production-caller-migration.ts`

Trace every registered `math.*` task to its actual implementation. Confirm which tasks
currently have definitions only, which use legacy simulation code, and which already
delegate to a canonical package owner.

## Required behavior

- Provide exactly one implementation owner for each executable math task from curriculum
  import through publish dry-run.
- Execute through `WorkflowOperator` and canonical task registrations; do not create a
  second state machine, cache, retry loop, or batch lifecycle.
- Bind task fingerprints to curriculum release, lesson/visual profile revisions, locale,
  variant, verifier, renderer, provider configuration, and dependency artifacts.
- Resolve profile readiness against the authoritative loaded curriculum release and
  supported verifier/capability evidence. Do not trust caller-authored status, approval,
  content-hash, or `deterministicVerificationSupported` assertions by themselves.
- Align the offline verifier bootstrap with protocol/verifier v3. The current setup script
  still checks for `2.0.0` while source and the TypeScript adapter require `3.0.0`.
- Promote only validated workflow-owned artifacts and preserve append-only attempts,
  interruption, reconciliation, invalidation, and resume semantics.
- Keep `plan` and `--dry-run` side-effect-free: zero writes, subprocesses, providers, and
  mutations unless the canonical dry-run contract explicitly records a plan artifact.
- Make legacy `math production run|resume|status|inspect` thin adapters over the canonical
  workflow rather than calls to `runPilotSimulation`.
- Preserve explicit simulation as a provider-free fixture mode in an isolated workspace.
- Keep provider-dependent tasks blocked unless runtime configuration and an explicit
  operator action authorize them. Tests must use mocks and must not call a provider.
- Keep publishing dry-run-only. Do not add live upload behavior.
- Preserve packaged CLI startup, JSON/error contracts, exit codes, and story/horror
  behavior.
- Make the legacy production plan a projection of the canonical DAG; it must not retain a
  divergent 15-stage list after the 18-task registry becomes executable.

Do not mark tasks implemented with no-op handlers. A handler must validate inputs, invoke
the real owning use case, emit validated artifact evidence, and report failure truthfully.
Unsupported work must block with an actionable reason.

## Adversarial coverage

Add focused tests for missing implementation, wrong owner, stale dependency, forged
artifact hash, profile revision mismatch, interrupted task, resume after promotion,
provider task without authorization, dry-run side effects, duplicate execution, and a
legacy CLI command bypassing the operator.

## Verification

Run the directly affected registry/operator test first, then one CLI test file, then at
most one affected-package typecheck after tests pass. Follow the command and repair budget
in `AGENTS.md`; do not run repository-wide checks.

## Acceptance

- The canonical lesson workflow reports real implementations for all tasks needed through
  publish dry-run.
- The packaged lesson graph reports implementation bindings for those tasks, and a clean
  verifier bootstrap either passes from an approved wheelhouse or is reported as an exact
  external-environment blocker without accepting production execution.
- A provider-free `M5-ZO-001/standard/de` run can traverse the canonical operator and
  resume without the legacy simulation runner owning production state.
- Provider and live-publish operations remain fail-closed.
- Existing workflow and story/horror characterization tests remain unchanged or receive
  only evidence-backed additive assertions.
- Create the required Codex-run report. Do not commit unless requested.
