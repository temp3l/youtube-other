# Safe Implementation Batches

## Batch Contract

Every batch is independently reviewable and reversible. Before implementation,
record `git status -sb`, protect user changes, add characterization tests, and
name the exact affected paths. Run the directly affected test first and stay
within the verification budget in `AGENTS.md`. Each batch ends with its Codex
report and an update to the master implementation report when applicable.

Compatibility adapters are preferred over dual writes or big-bang moves. A
batch may remove production logic only when all callers are migrated and the
removal checks in `06-duplicate-elimination.md` pass.

## Batch 0: Complete the Audit Gate

- **Objective:** Produce the registers defined in
  `00-baseline-and-audit-gate.md` and freeze canonical ownership decisions.
- **Scope:** Read-only repository inspection and audit documents only.
- **Likely paths:** `docs/refactor/`, existing relevant audits and inventories.
- **Prerequisites:** None.
- **Steps:** Inventory entry points, writers, paths, providers, prompts, state,
  cache, batches, tests, profiles, and AI pack; classify facts and duplicates;
  record callers and proposed owners; finalize migration risks.
- **Compatibility:** No runtime change.
- **Validation:** `git diff --check -- docs/refactor`; link/path checks.
- **Rollback:** Revert audit documents only.
- **Risks:** Hidden shell/Codex entry points or generated-runtime drift.
- **Complete when:** Every register and canonical decision is evidenced and no
  production file changed.

## Batch 1: Stabilize the Baseline

- **Objective:** Separate and repair accepted baseline regressions before
  architectural migration.
- **Scope:** The recorded typecheck, lint, and focused failing tests.
- **Likely paths:** affected math-rendering, story-localization,
  image-generation, rendering, CLI, and test files only.
- **Prerequisites:** Batch 0 accepted.
- **Steps:** Classify all failures; eliminate stale `dist` use where proven;
  repair `math-verifier.v2/v3` lineage; correct lint environment/type imports;
  address contract or fixture failures without weakening assertions.
- **Compatibility:** Preserve accepted current outputs and dirty renderer work.
- **Tests:** Exact failing files first; one affected-package typecheck after
  focused tests pass; lint only touched files where supported.
- **Rollback:** Revert each focused repair independently.
- **Risks:** Failures may expose unfinished concurrent work; stop on direct
  conflict and ask the owner.
- **Complete when:** Baseline status is green or every remaining failure is
  proved unrelated, recorded, and unchanged by subsequent batches.

## Batch 2: Shared Contracts and Error Taxonomy

- **Status:** `ACCEPTED` on 2026-07-14. Batch 3 is unblocked.
- **Objective:** Add strict profile, task, artifact, workflow, quality, approval,
  batch, and typed-error contracts without changing execution.
- **Scope:** Schema/type additions and tests.
- **Likely paths:** `packages/domain`, new `packages/workflow-engine` package
  skeleton, workspace metadata.
- **Prerequisites:** Batch 1 stable.
- **Steps:** Add branded IDs and discriminated unions; implement schema/version
  constants; define hard-failure reason code registries and error-to-exit mapping;
  reject unknown fields and profile names.
- **Compatibility:** Existing types adapt through explicit conversion functions.
- **Tests:** Schema parse/rejection, round-trip, exhaustiveness, and exit mapping.
- **Rollback:** Remove the unused new package/contracts.
- **Risks:** Cyclic dependencies; domain must remain I/O-free.
- **Complete when:** Contracts compile, tests pass, and no production caller is
  switched yet.

## Batch 3: Canonical Artifact Repository

- **Status:** `ACCEPTED` on 2026-07-14. Batch 4 is unblocked.
- **Objective:** Make one resolver responsible for production paths and artifact
  validity.
- **Scope:** Typed artifact intent, canonical path mapping, legacy discovery,
  manifests, checksums, containment, atomic promotion, and dry-run migration.
- **Likely paths:** `packages/shared`, `packages/workflow-engine`, resolver tests.
- **Prerequisites:** Batch 2.
- **Steps:** Characterize current paths; expand the episode resolver; add math
  lesson adapter; implement conflict detection and read precedence; centralize
  writes; add artifact verification and migration-plan APIs.
- **Compatibility:** Canonical writes plus legacy reads; never dual-write unless
  an existing contract requires a temporary compatibility output documented in
  the artifact matrix.
- **Tests:** Traversal/symlink rejection, canonical resolution, ambiguity,
  checksum failure, atomic promotion, dry-run migration, rollback manifest.
- **Rollback:** Restore consumer path calls; generated canonical outputs remain
  readable but are not deleted.
- **Risks:** Historical episode divergence and caller-created filenames.
- **Complete when:** Resolver characterization passes and new APIs make no
  unplanned artifact writes.

## Batch 4: Task Registry and DAG

- **Status:** `ACCEPTED` on 2026-07-14. Batch 5 is unblocked.
- **Objective:** Register every logical task once and validate profile DAGs.
- **Scope:** Registry, definitions, dependency resolution, readiness, explain,
  and dry-run planning.
- **Likely paths:** `packages/workflow-engine`, profile registration adapters.
- **Prerequisites:** Batches 2-3.
- **Steps:** Implement registry validation; wrap, but do not rewrite, selected
  existing services; add execution-kind and policy metadata; expose list/explain
  APIs; reject cycles, duplicate IDs, invalid artifacts, and missing approvals.
- **Compatibility:** Existing services remain callable until caller migration.
- **Tests:** Registry uniqueness, cycles, dependency order, optional edges,
  profile applicability, readiness, explain output.
- **Rollback:** Remove registry adapters; services remain intact.
- **Risks:** Mistaking strategy alternatives for duplicate logical tasks.
- **Complete when:** Both profile DAGs validate and every registered task has one
  implementation owner.

## Batch 5: State, Events, Locks, and Reconciliation

- **Status:** `ACCEPTED` on 2026-07-14. Batch 6 is unblocked.
- **Objective:** Establish canonical resumable state and immutable history.
- **Scope:** State materialization, event append, attempts, approvals, overrides,
  transitions, locks, interruption, and reconcile.
- **Likely paths:** `packages/workflow-engine`, focused persistence helpers.
- **Prerequisites:** Batch 4.
- **Steps:** Implement store layout; append event before rebuilding state;
  validate manual files; add stale-lock/run detection; reconcile outputs created
  before state updates; preserve failure payloads.
- **Compatibility:** Import subsystem manifests as reconciliation evidence; do
  not silently mark imported tasks successful.
- **Tests:** All transitions, impossible transitions, atomicity, corrupt state
  rebuild, stale locks, crash windows, manual override reason, stale approval.
- **Rollback:** Disable engine store and retain existing subsystem state.
- **Risks:** Multiple sources of truth during migration.
- **Complete when:** `state.json` rebuilds from events plus validated operator
  records and `next` is fully derived.

## Batch 6: Status, Next, Run-Next, Resume, and CLI Skeleton

- **Status:** `ACCEPTED` on 2026-07-14. Batch 7 is unblocked.

- **Objective:** Provide the canonical operator loop without migrating all task
  families at once.
- **Scope:** Engine CLI commands and JSON/exit contracts.
- **Likely paths:** `apps/cli`, `packages/workflow-engine`.
- **Prerequisites:** Batch 5.
- **Steps:** Register resource/action commands; generate help from registry;
  implement plan/graph/status/next; run exactly one task by default; add resume,
  invalidate, retry, reconcile, state validate, and override.
- **Compatibility:** New commands are additive. Existing commands remain primary
  until their task family migrates.
- **Tests:** Parsing, help, JSON, dry-run side effects, exit codes, actionable
  messages, single-task `run-next`.
- **Rollback:** Remove additive registrations.
- **Risks:** CLI option precedence currently exists in multiple helpers.
- **Complete when:** A deterministic no-provider fixture can plan, execute,
  interrupt, resume, and reconcile through the packaged CLI.

## Batch 7: Fingerprints, Cache, and Invalidation

- **Status:** `ACCEPTED` on 2026-07-14. Batch 8 is unblocked.

- **Objective:** Make every migrated task safely repeatable.
- **Scope:** Fingerprints, cache decision evidence, output validation, dependency
  invalidation, explain-miss, and prune safety.
- **Likely paths:** engine plus existing prompt, narration, story, image, render,
  and math cache adapters.
- **Prerequisites:** Batches 4-6.
- **Steps:** Normalize fingerprint inputs; adapt subsystem cache records; require
  successful validated manifests; implement dependency invalidation and explicit
  invalidation events; expose cache inspection.
- **Compatibility:** Existing caches may be read through versioned adapters; an
  unknown legacy identity is a miss, never a hit.
- **Tests:** Stable hashes, each material input change, corrupt/missing outputs,
  stale dependencies, explicit invalidation, unrelated-branch preservation.
- **Rollback:** Bypass engine cache and rerun through canonical tasks; never
  delete historical cache data automatically.
- **Risks:** False hits are more damaging than conservative misses.
- **Complete when:** No task uses file existence as success or cache evidence.

## Batch 8: Batch Unification and Observability

- **Status:** `ACCEPTED` on 2026-07-14. Batch 9 is unblocked.

- **Objective:** Reuse normal tasks for resumable item-level batches and emit one
  structured attempt contract.
- **Scope:** Batch manifests, grouping, retries, cancellation, reconciliation,
  cost and provider metadata, redaction.
- **Likely paths:** engine, observability, story/image/math batch adapters.
- **Prerequisites:** Batch 7.
- **Steps:** Add deterministic batch/item IDs; adapt existing batch stores;
  preserve provider request IDs and failure payloads; make concurrency config
  driven; implement partial success and independent retry.
- **Compatibility:** Existing story/image batch commands delegate through
  adapters and retain their documented lifecycle during deprecation.
- **Tests:** Partial failure, resume, cache hits, cancellation, rate limits,
  retry classification, cost totals, redaction, no successful-item regeneration.
- **Rollback:** Restore prior command adapters without deleting batch records.
- **Risks:** Provider batch semantics differ from local concurrency.
- **Complete when:** Sync and provider batch paths invoke identical task
  implementations and produce compatible artifact manifests.

## Batch 9: Dark Truth Bibles, References, and Quality

- **Status:** `ACCEPTED` on 2026-07-14. Batch 10 is unblocked.
- **Objective:** Implement the complete Dark Truth profile contract.
- **Scope:** `04-darktruth-profile.md`.
- **Likely paths:** `packages/dark-truth`, story-localization, visual-planning,
  image-generation, speech, metadata, profile CLI adapters.
- **Prerequisites:** Batches 4-8.
- **Steps:** Add bible/reference schemas and stores; bind revisions into tasks;
  add approval and invalidation; implement narrative, localization, Shorts,
  visual, thumbnail, audio, audiovisual, metadata, and publish gates.
- **Compatibility:** Existing character registries/references import into the
  new manifests; missing evidence blocks rather than fabricates approval.
- **Tests:** See `04-darktruth-profile.md`.
- **Rollback:** Disable profile enforcement behind the migration adapter while
  preserving created manifests and events.
- **Risks:** Existing episodes lack complete bible/reference provenance.
- **Complete when:** Required references and bibles are enforced for new runs and
  legacy episodes receive actionable migration status.

## Batch 10: Mathematics Profile Integration

- **Status:** `ACCEPTED` on 2026-07-14. Batch 11 is unblocked.
- **Objective:** Move existing mathematics orchestration onto the shared engine
  without weakening correctness or accessibility.
- **Scope:** `05-mathematics-profile.md`.
- **Likely paths:** math-education, math-rendering, educational-renderer, config,
  CLI profile adapters.
- **Prerequisites:** Batches 4-8 and accepted current renderer work.
- **Steps:** Adapt curriculum, lesson, verification, visuals, narration, quality,
  metadata, batch, and dry-run publishing tasks; add education visual manifest;
  derive state from the shared engine.
- **Compatibility:** Existing lesson artifacts and manifests import through
  versioned adapters; no horror policy dependency is introduced.
- **Tests:** See `05-mathematics-profile.md`.
- **Rollback:** Return math commands to the prior orchestrator while keeping
  shared contracts additive.
- **Risks:** Concurrent dirty renderer changes and v2/v3 lineage migration.
- **Complete when:** Deterministic pilot workflows pass for configured locales,
  variants, and supported curriculum scope.

## Batch 11: Production-Family Caller Migration

- **Status:** `ACCEPTED` on 2026-07-14. Batch 12 is unblocked.
- **Objective:** Route every entry point through canonical tasks.
- **Scope:** Story, localization, image/reference/thumbnail, audio/caption,
  render, metadata, publishing, repair, migration, scripts, and npm wrappers.
- **Likely paths:** capability packages, `apps/cli`, scripts, package manifests.
- **Prerequisites:** Profile tasks accepted.
- **Steps:** Follow the family order and gates in
  `06-duplicate-elimination.md`; migrate one family per commit-sized unit;
  preserve output/JSON/exit behavior through wrappers.
- **Compatibility:** Thin aliases only; no duplicated business logic.
- **Tests:** Family characterization, canonical/legacy path equivalence, CLI and
  complete-workflow integration.
- **Rollback:** Restore that family's adapter, not removed internals.
- **Risks:** Hidden Codex or shell callers.
- **Complete when:** Caller searches show only engine invocation or explicit
  adapters.

## Batch 12: Migration Utilities and Publish Approval

- **Status:** `ACCEPTED` on 2026-07-14. Batch 13 is unblocked.
- **Objective:** Make legacy data migration safe and publishing irreversible
  only after explicit approval.
- **Scope:** Artifact verify/migrate, bible/reference migration, approval-bound
  publish dry-run and execute tasks.
- **Likely paths:** engine artifact repository, profile migration adapters,
  upload package, CLI.
- **Prerequisites:** Batch 11.
- **Steps:** Generate migration plans; verify source/target hashes; promote
  atomically; record rollback; bind publish approvals to exact artifacts,
  metadata, channel, locale, variant, and dry-run evidence.
- **Compatibility:** No automatic bulk moves; legacy reads remain until explicit
  migration acceptance.
- **Tests:** Dry-run zero writes, conflicts, rollback, stale approval, wrong
  channel/locale, interrupted migration, publishing mutation seam.
- **Rollback:** Apply recorded migration rollback; publishing itself is not
  invoked during refactor verification.
- **Risks:** Historical conflicts require operator decisions.
- **Complete when:** Migration is auditable and no publish task can run without
  current attributable approval.

## Batch 13: Remove Duplicates and Deprecated Logic

- **Status:** `ACCEPTED` on 2026-07-14 with explicitly gated compatibility debt.
  Batch 14 is unblocked.
- **Objective:** Delete obsolete production implementations after proof of
  disuse.
- **Scope:** Items marked removable by `06-duplicate-elimination.md`.
- **Likely paths:** determined by final caller inventory.
- **Prerequisites:** All callers migrated and compatibility acceptance passed.
- **Steps:** Search imports/scripts; remove one family at a time; keep delegating
  aliases; update package dependencies; run dead-path and writer scans.
- **Compatibility:** Deprecation messages name the canonical replacement and
  removal release/condition.
- **Tests:** Packaged CLI, legacy aliases, family regression, output paths,
  schemas, logs, exit codes, and side effects.
- **Rollback:** Restore the removed implementation behind the adapter for one
  release; do not restore direct callers.
- **Risks:** Untracked external automation cannot be discovered locally.
- **Complete when:** Exactly one application implementation exists per logical
  task and retained alternatives are explicit strategies.

## Batch 14: AI Pack and Final Release Gate

- **Status:** `READY` on 2026-07-14. The current duplicate inventory has no
  unexplained application implementation; retained adapters have removal gates.
- **Objective:** Refresh AI context from the accepted source and validate the
  whole deterministic repository.
- **Scope:** `07-ai-content-pack.md` and `08-validation-and-release.md`.
- **Prerequisites:** Duplicate removal accepted.
- **Steps:** Build and validate the curated pack; update docs and command index;
  run final deterministic checks and duplicate/writer scans; record remaining
  debt and adapters.
- **Compatibility:** Replace or redirect the old context pack without breaking
  documented upload workflows.
- **Tests:** AI-pack build/status/validate plus final validation matrix.
- **Rollback:** Restore the previous pack generator/input manifest; source code
  remains unaffected.
- **Risks:** Broad checks may expose unrelated pre-existing failures.
- **Complete when:** All completion criteria are evidenced, or remaining failures
  are unchanged pre-existing issues explicitly accepted by the operator.
