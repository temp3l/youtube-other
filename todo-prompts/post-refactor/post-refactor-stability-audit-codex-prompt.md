# Post-Refactor Stability Audit and Recovery Prompt

## Role

Act as a senior TypeScript monorepo architect and production-readiness reviewer.

The repository has recently undergone several major refactors, including:

- removal of the legacy service/pipeline;
- visual implementation refactoring;
- story rewrite refactoring;
- canonical script path normalization;
- application orchestration changes;
- cache and artifact identity changes;
- CLI/API/worker entry-point changes;
- package, dependency, and build-wiring cleanup;
- test, fixture, and documentation updates.

The goal is to determine whether the system is stable, internally consistent, and production-ready after these changes.

This is not primarily a feature-development task. It is a structured stabilization audit with targeted fixes only where defects are proven.

## Repository context

Before changing code, read:

- `AGENTS.md` and all repository-local instruction files;
- `docs/plans/remove-legacy-and-normalize-paths/00-executive-summary.md`;
- `docs/plans/remove-legacy-and-normalize-paths/16-risk-register.md`;
- `docs/plans/remove-legacy-and-normalize-paths/17-target-architecture.md`;
- `docs/plans/remove-legacy-and-normalize-paths/18-implementation-order.md`;
- `docs/plans/remove-legacy-and-normalize-paths/19-final-cleanup-checklist.md`;
- `docs/plans/remove-legacy-and-normalize-paths/20-planning-report.md`;
- all task files under `docs/plans/remove-legacy-and-normalize-paths/tasks/`;
- relevant plans and reports for the visual implementation and story rewrite refactors;
- package-level README files and architecture documents for the affected packages.

Also inspect recent Git history and the diff range covering the refactors.

## Mandatory operating rules

- Do not assume that passing unit tests proves the repository is stable.
- Do not perform broad redesigns unless a concrete defect requires them.
- Do not reintroduce the removed legacy pipeline or compatibility paths.
- Do not weaken tests, suppress TypeScript errors, or add unsafe casts to make validation pass.
- Do not use `any` except where the existing external library contract makes it unavoidable and the use is narrowly documented.
- Do not silently default episode, language, variant, paths, or providers.
- Do not make paid API calls during the audit.
- Do not generate images, speech, transcriptions, remote renders, uploads, or other paid artifacts.
- Use mocks, fixtures, local validation, cached artifacts, dry-run modes, and validation-only modes.
- Do not delete production data, caches, generated assets, or episode content automatically.
- Do not update unrelated dependencies.
- Do not reformat unrelated files.
- Do not commit credentials, secrets, cache files, generated media, or temporary audit artifacts.
- Stop rather than guessing when an external contract, data migration, or rollout decision is unclear.
- Keep every fix focused, typed, tested, and observable.

## Branch and baseline

1. Confirm the current branch and working tree.
2. If the current working tree contains unrelated uncommitted changes, do not overwrite them.
3. Record:
   - current branch;
   - current commit;
   - Node and pnpm versions;
   - workspace package list;
   - changed packages from recent refactors;
   - current uncommitted files.
4. Create an audit report directory if the repository conventions permit it, for example:

```text
docs/audits/post-refactor-stability/
```

Do not create this directory when repository instructions specify a different location.

## Phase 1 — Build a system boundary map

Before editing code, map the actual active runtime flow:

```text
CLI / API / workers
  -> application use cases
  -> story rewrite / localization
  -> canonical script resolver
  -> visual implementation
  -> scene planning
  -> image generation setup
  -> narration setup
  -> timing / slicing
  -> rendering
  -> metadata
  -> upload preparation
```

For each boundary, identify:

- input type;
- output type;
- owning package;
- runtime entry point;
- schema or manifest version;
- cache identity fields;
- error contract;
- tests;
- logging context;
- remaining compatibility behavior;
- whether the boundary is used by full, Short, English, German, or all variants.

Create a concise dependency and contract matrix in the audit report.

## Phase 2 — Repository integrity checks

Run the cheapest deterministic checks first.

Discover actual repository scripts rather than assuming names, then run the applicable equivalents of:

```bash
git status --short
pnpm install --frozen-lockfile
pnpm -r --if-present typecheck
pnpm lint
pnpm test:unit
```

Do not continue blindly after failures.

For every failure:

- identify the owning package;
- determine whether it is pre-existing or caused by the refactors;
- capture the exact error;
- fix only confirmed regressions within scope;
- rerun the narrowest relevant validation.

Also inspect:

```bash
pnpm -r list --depth -1
pnpm why @mediaforge/pipeline
```

Use repository-specific alternatives where appropriate.

## Phase 3 — Stale reference and dependency audit

Run repository-wide searches for removed or transitional concepts.

At minimum, search for:

```bash
rg "@mediaforge/pipeline|createPipeline" .
rg "legacyGenerated|legacy-mixed|story-workflow-legacy" .
rg "en/full/script.md|de/full/script.md|en/script.md|de/script.md" .
rg "audio/script-source|root script.md|compatibility path|fallback path" apps packages scripts docs
rg "pipeline_runs|step_runs|saveStepRun|savePipelineRun" .
rg "NARRATION_PIPELINE_MODE|legacy" packages apps scripts docs .env.example
rg "TODO|FIXME|HACK|temporary|compatibility|fallback" apps packages scripts
```

Classify every match as one of:

- active and intentional;
- migration-tool detection;
- historical documentation intentionally retained;
- test fixture intentionally covering rejection;
- false positive;
- stale defect;
- uncertain external contract.

Do not blindly delete all matches.

## Phase 4 — Canonical episode contract verification

Verify that the canonical authored-script layout is consistently enforced:

```text
episodes/<slug>/languages/script-<language>.md
episodes/<slug>/languages/short/script-<language>.md
```

Confirm:

- one shared normalized episode type;
- one shared normalized language type;
- one shared variant type;
- no implicit English default;
- legacy Spanish `sp` is rejected;
- traversal and containment checks exist;
- absolute and relative paths are not mixed unsafely;
- missing canonical files fail clearly;
- directories are rejected where files are required;
- stale authored-script layouts fail clearly;
- generated-output readers are not confused with authored-script readers;
- resolver version and content hash are available to downstream consumers.

Add or repair focused tests only where coverage is missing.

## Phase 5 — Story rewrite to visual implementation compatibility

This is a high-priority integration boundary.

Inspect the actual story rewrite output consumed by visual implementation.

Verify:

- schema/version compatibility;
- full and Short support;
- scene/segment identifiers;
- ordering guarantees;
- language propagation;
- character identity and continuity data;
- location/environment continuity data;
- visual beat or shot information;
- narration/script linkage;
- handling of empty, merged, split, or rewritten segments;
- no reliance on removed legacy fields;
- no unsafe fallback to guessed IDs or array indexes;
- actionable errors for invalid output.

Add a focused integration test that passes a representative story rewrite result into visual implementation and validates the produced visual/scene plan.

Do not mock away the contract being tested.

## Phase 6 — Cross-pipeline identity and referential integrity

Verify one stable identity model across:

- script resolver;
- story rewrite;
- visual plan;
- scene plan;
- image manifest;
- narration manifest;
- timing/slicing manifest;
- render manifest;
- metadata;
- resume state.

At minimum, confirm identity isolation by:

- episode;
- language;
- full vs Short variant;
- canonical relative script path;
- content hash;
- resolver/schema version.

Add or repair tests proving:

1. English and German do not share unsafe cache identities.
2. Full and Short do not share unsafe cache identities.
3. Script content changes invalidate dependent artifacts.
4. Script path/source changes cannot reuse an unsafe old cache entry.
5. Resolver/schema version changes invalidate incompatible entries.
6. Old cache entries become misses or stale, never unsafe hits.
7. Resume logic rejects stale or incomplete manifests.

Create a referential-integrity validator for test use or repository tooling if one does not already exist.

It should detect:

- duplicate scene IDs;
- missing scene references;
- narration segments without visual scenes;
- visual scenes without script/narration linkage;
- image records referencing unknown scenes;
- render inputs referencing missing images/audio;
- inconsistent language or variant;
- mismatched content hashes;
- stale absolute paths;
- invalid manifest versions;
- duplicate output ownership.

## Phase 7 — CLI, API, and worker verification

Verify all active public/runtime entry points.

Confirm:

- CLI commands delegate to application use cases;
- API startup does not depend on removed pipeline code;
- workers/scheduled jobs do not bypass application use cases;
- `--episode`, `--language`, and `--variant` remain explicit;
- dry-run and validation-only flags propagate correctly;
- force/resume semantics remain correct;
- no direct provider shortcut bypasses orchestration;
- health checks reflect active application/config state;
- errors preserve useful causes and structured log context;
- removed commands are actually absent or intentionally aliased;
- aliases do not call low-level helpers directly.

Add or repair focused entry-point tests where needed.

## Phase 8 — Full and Short multilingual smoke matrix

Use a representative repository-owned episode, preferably episode 022, and validate:

| Flow | English | German |
|---|---:|---:|
| Canonical script resolution | required | required |
| Full rewrite validation | required | required |
| Short rewrite validation | required | required |
| Visual implementation | required | required |
| Scene-plan generation | required | required |
| Narration setup | required | required |
| Image-generation setup | required | required |
| Render setup | required | required |
| Metadata generation | required | required |

Use dry-run, validation-only, mocks, local fixtures, or existing cached artifacts.

Do not invoke paid providers.

For every matrix cell, capture:

- command;
- exit status;
- output paths;
- manifest/schema versions;
- episode/language/variant;
- content hash;
- scene count;
- warnings/errors;
- whether a legacy fallback was attempted.

A command returning exit code zero is not sufficient. Inspect generated intermediate artifacts and manifests.

## Phase 9 — Artifact inspection

Inspect representative outputs from the smoke matrix:

- resolver result;
- rewrite manifest;
- visual plan;
- character/continuity map;
- scene plan;
- image manifest;
- narration manifest;
- timing/slicing manifest;
- render manifest;
- metadata result.

Verify:

- all scene IDs are unique and stable;
- ordering is deterministic;
- every scene maps back to a valid script segment;
- every narration segment maps to valid visual coverage;
- every image maps to a valid scene;
- every render input exists;
- language and variant are consistent;
- canonical paths are used;
- no removed legacy fields are required;
- content hashes align;
- no stale absolute paths are persisted unnecessarily;
- full assets are not accidentally reused for Shorts;
- German assets are not accidentally reused for English;
- resume state is complete and consistent.

## Phase 10 — Targeted regression fixes

Only after completing the audit, implement minimal fixes for confirmed defects.

For each fix:

1. Document the defect and violated invariant.
2. Add a failing focused test.
3. Implement the smallest correct fix.
4. Preserve strict typing and package boundaries.
5. Add structured logging where diagnosis would otherwise be difficult.
6. Rerun the focused test.
7. Rerun the affected smoke-matrix cells.
8. Record the result in the audit report.

Do not combine unrelated cleanup with defect fixes.

## Phase 11 — Controlled end-to-end readiness plan

Do not perform paid production generation in this task.

Instead, determine whether the repository is ready for a controlled real run and document the exact command/configuration for:

1. one English full episode;
2. one German full episode;
3. one English Short;
4. one German Short.

The plan must use:

- one representative episode;
- fresh isolated output/cache directories where supported;
- no upload;
- conservative provider settings;
- minimal image generation;
- local rendering where available;
- explicit cost-impact warning;
- rollback/cleanup instructions.

If the repository provides a zero-cost local/mock end-to-end mode, run it.

## Phase 12 — Final validation

Run the applicable focused tests and package typechecks for all changed areas.

At minimum, include the actual repository equivalents of:

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- apps/cli/src/index.unit.test.ts
pnpm --filter @mediaforge/shared typecheck
pnpm --filter @mediaforge/cli typecheck
pnpm --filter @mediaforge/api typecheck
```

Also run focused tests for:

- story rewrite;
- visual implementation;
- cache identity;
- narration manifests;
- image manifests;
- rendering manifests;
- migration tool;
- integration/referential integrity.

Do not run broad expensive builds or provider-backed tests unless repository instructions explicitly authorize them.

## Required deliverables

Produce a final report under the repository's approved documentation location containing:

### 1. Executive verdict

Choose exactly one:

- `READY`
- `READY WITH NON-BLOCKING RISKS`
- `NOT READY`

### 2. System boundary matrix

List each boundary, owner, input/output contract, tests, and status.

### 3. Validation matrix

Include every full/Short and English/German smoke cell.

### 4. Findings

For every finding include:

- severity: blocker/high/medium/low;
- affected packages;
- violated invariant;
- reproduction;
- root cause;
- fix status;
- residual risk.

### 5. Stale-reference classification

Classify every remaining legacy/compatibility match.

### 6. Changed files

Separate:

- production code;
- tests;
- fixtures;
- docs;
- tooling.

### 7. Validation evidence

List exact commands, exit codes, and summaries.

### 8. Paid-call confirmation

Explicitly confirm that no paid provider calls were executed.

### 9. Controlled real-run plan

Provide the exact next-step commands and safeguards for the first real production smoke test.

### 10. Merge recommendation

State whether the current branch should:

- merge now;
- merge after listed non-blocking work;
- remain blocked.

## Stop conditions

Stop and report instead of guessing when:

- repository-owned episode scripts contain unresolved divergent duplicates;
- an external CLI/API/event contract cannot be classified;
- staged narration rollout is not approved;
- a data-destructive persistence change would be required;
- paid provider execution is the only way to proceed;
- active consumers still depend on removed legacy behavior;
- the current working tree contains unrelated changes that cannot be safely separated;
- a refactor plan conflicts with actual runtime behavior.

## Final response format

Return:

1. concise executive verdict;
2. highest-risk defects;
3. fixes applied;
4. validation summary;
5. remaining blockers;
6. exact report path;
7. exact next recommended action.

Do not claim stability unless the cross-package integration checks and multilingual full/Short matrix are actually validated.
