Recommended model: GPT-5/Codex

Recommended reasoning: high

# Resume Horror Evaluation with an Atomic Candidate-Execution Ledger

Continue the horror controlled-evaluation work in the existing repository on
branch `mathe-init`. The current base commit is `f29a43c`; Tasks 01–08 and later
production-evaluation work are uncommitted alongside unrelated mathematics
changes. Preserve the entire worktree. Do not reset, clean, stash, overwrite,
or broadly reformat it.

## Scope

Implement only the next approved zero-dispatch step: a mock-validated execution
adapter with an atomic provider-call/cost ledger bound to the v3 candidate
generation preflight.

Do not dispatch a real provider request. Do not generate real production
candidates. Do not collect ratings, import analytics, produce a v3 outcome
decision, promote rollout mode, upload, publish, or begin another plan phase.

## Inspect First

Read completely before editing:

- `AGENTS.md`
- `packages/story-localization/AGENTS.md`
- `docs/ai-context/context-pack.md`
- `docs/plans/research-informed-horror-storytelling-plan.md`, focusing only on
  the controlled-evaluation phase and its gates
- `docs/development/horror-controlled-evaluation/README.md`
- `docs/development/horror-controlled-evaluation/production-evaluation-approval-packet.v3.md`
- `docs/development/horror-controlled-evaluation/candidate-generation-preflight.v3.json`
- `docs/reports/codex-runs/2026-07-26-horror-production-candidate-adapter.md`
- `docs/reports/codex-runs/2026-07-26-horror-production-candidate-persistence.md`
- `docs/reports/codex-runs/2026-07-26-horror-candidate-generation-preflight.md`
- `docs/reports/2026-07-24/research-informed-horror-storytelling-plan-implementation-report.md`
- `packages/story-localization/src/horror-evaluation-rollout.ts`
- `packages/story-localization/src/horror-evaluation-rollout.unit.test.ts`

Inspect existing filesystem helpers, persistence conventions, cost controls,
workflow state, provider seams, exports, and focused tests. Reuse the current
architecture; do not create a parallel evaluation runner.

## Current Contract

The immutable v3 evaluation and preflight use the corrected cohort
`025/028/041/051`, with separate Full and Short units. The preflight binds all
eight units to accepted source/canonical/baseline lineage, requires strategy
Full before its paired strategy Short, fixes `enforce` generation to zero
retries, and caps each unit at one call and USD 1.00. Aggregate ceilings are
eight calls and USD 8.00. The preflight records zero dispatched calls and is not
authorization to spend money.

Candidate-set persistence and separate Full/Short blind review packet
persistence already exist. Their immutable contracts must remain compatible.
The rollout decision remains `shadow`.

## Required Behavior

1. Add a versioned, schema-validated execution-ledger contract and canonical
   runtime path using existing horror evaluation path ownership.
2. Bind the ledger to the exact evaluation ID, manifest hash, preflight hash,
   preflight version, sample units, strategy versions, and budget. Reject stale,
   partial, reordered, extra, or changed inputs.
3. Persist the initial ledger before any dispatch attempt. Use an atomic
   same-directory temporary write plus rename, or the repository's equivalent
   proven helper. A failed write must leave the last valid ledger readable.
4. Use explicit legal state transitions. Reserve a unit's call and cost ceiling
   durably before invoking the injected provider boundary. Enforce:
   - no more than one attempt per unit;
   - zero automatic retries;
   - at most eight aggregate calls;
   - at most USD 1.00 reserved/charged per unit;
   - at most USD 8.00 reserved/charged in aggregate.
5. Enforce canonical order and dependencies: each strategy Full must complete
   before its paired strategy Short can be reserved. A failed, blocked, or
   uncertain Full must leave its Short blocked.
6. Give each unit a stable request fingerprint and idempotency key derived from
   immutable preflight identity. Do not store secrets, authorization values, or
   raw provider credentials.
7. Make resume fail closed:
   - completed units are reused and never dispatched again;
   - planned units may continue when budgets and dependencies allow;
   - a unit interrupted after durable reservation/dispatch start is
     `uncertain` and must never be automatically retried;
   - reconciliation of uncertain remote state requires a separate explicit
     operator action or future task.
8. Do not claim exactly-once provider execution when the provider cannot prove
   it. The ledger must prevent automatic duplicate spending across local
   interruption and make residual uncertainty explicit.
9. Inject the provider/candidate generator, clock, and any failure seam needed
   for deterministic tests. Tests must use a fake adapter only and prove zero
   network/provider activity.
10. On fake success, record only the data needed for lineage, cost accounting,
    and later candidate-set assembly, including candidate hash and accepted
    final-line/hash evidence. Do not write fake output into the frozen
    production candidate artifacts.
11. Preserve immutable v3 manifest/preflight files. Keep production execution
    disabled unless a later human explicitly authorizes paid dispatch.
12. Export only the minimal new public contracts required by existing package
    conventions.

## Focused Verification

Add semantic assertions covering at least:

- exact v3 ledger initialization and identity binding;
- atomic persistence, identical reuse, and changed-input rejection;
- Full-before-Short dependency enforcement;
- per-unit and aggregate call/cost ceilings;
- completed-unit resume without duplicate invocation;
- interruption after reservation becoming fail-closed `uncertain`;
- failed atomic promotion preserving the last valid ledger;
- zero retry behavior and zero real provider calls;
- absence of secrets from persisted JSON.

Inspect `scripts/test-focused.sh` before choosing commands. Run the directly
affected test file first:

```bash
pnpm test:focused -- packages/story-localization/src/horror-evaluation-rollout.unit.test.ts
```

Use an exact test-name filter only to debug one failure. Stay within the root
budget: at most three distinct test commands, at most two targeted repairs, no
unchanged failing rerun, and at most one
`pnpm --filter @mediaforge/story-localization typecheck` after focused tests
pass. Run targeted `git diff --check`. Do not run broad tests, builds, lint,
snapshots, fixture regeneration, or provider-backed tests.

## Documentation and Reporting

Update controlled-evaluation documentation only for implemented behavior.
Accurately retain:

- no paid dispatch authorization;
- zero production provider calls;
- no production candidates, ratings, analytics, decision, or promotion;
- rollout mode `shadow`;
- the next step is explicit human authorization before paid dispatch.

Because this continues
`docs/plans/research-informed-horror-storytelling-plan.md`, create or update the
required current-execution-date plan report:

`docs/reports/YYYY-MM-DD/research-informed-horror-storytelling-plan-implementation-report.md`

Also create:

`docs/reports/codex-runs/YYYY-MM-DD-horror-candidate-execution-ledger.md`

Each report must be accurate and under 200 words. Include source plan where
required, summary, changed paths, completed/partial/not-completed work,
deviations, exact checks/results, base or resulting commit hash, unresolved
risks, and smallest next step.

Do not commit or push unless the human explicitly asks, and never stage
unrelated work. Stop after the mock-validated adapter and atomic ledger are
complete.
