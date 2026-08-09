# Codex Goal — Implement the Veronica Benini / Strategic Reinvention Plan Safely

You are the implementation coordinator for the existing `veronicabenini` YouTube production system.

`strategic-reinvention` is only an internal compatibility alias for the canonical `veronicabenini` genre.

Your job is to implement the COMPLETE approved implementation plan safely, efficiently, and with bounded token usage.

Do not stop after each routine task or wave.
Continue automatically while the next action is safe, planned, and unblocked.

---

## 1. Authoritative plan

Read and execute the implementation plan at:

`docs/plans/veronicabenini-strategic-reinvention-implementation/`

Start with:

- `README.md`
- `PLANNING-CHECKPOINT.md`
- `implementation-task-plan.md`
- `dependency-waves.md`
- `architecture-decisions.md`
- `story-coverage-matrix.md`
- `product-decision-blockers.md`

Then read individual task files only when they become executable.

Do NOT rediscover or redesign the full product scope.

The plan has already reconciled:

- 81 user stories
- 14 user journeys
- 16 epics
- 26 implementation tasks
- 9 dependency waves
- 0 product blockers

Treat those planning artifacts as authoritative unless repository reality has changed materially since the plan was produced.

---

## 2. Primary goal

Implement all executable tasks in the plan, in dependency order, until one of these conditions is true:

1. all planned implementation tasks are complete;
2. a genuine external blocker prevents further safe progress;
3. continuing would require an irreversible or externally visible action not already authorized by the plan;
4. repository state materially contradicts the plan and requires a new architectural/product decision.

Routine implementation uncertainty is NOT a reason to stop.

Resolve routine engineering decisions using:

1. existing repository architecture;
2. documented architecture decisions;
3. existing conventions;
4. safest backward-compatible implementation;
5. explicit fail-closed behavior where security, authorization, publishing, credentials, or spending is involved.

Do not ask for confirmation between ordinary tasks or dependency waves.

---

## 3. Canonical architecture invariants

These are non-negotiable unless the plan explicitly supersedes them.

### Identity

`veronicabenini` is canonical.

`strategic-reinvention` must never become:

- a second genre model;
- a duplicated configuration tree;
- a parallel workflow;
- a second set of persistence entities;
- a second API surface with divergent behavior.

Compatibility aliasing is acceptable.

### Production state

Use one canonical episode/revision/workflow-event authority.

Derived artifacts reference immutable production revisions.

Do not introduce competing mutable sources of truth.

### Shared infrastructure

Extend existing shared capabilities for:

- source manifests;
- artifact lineage;
- provenance;
- cache fingerprints;
- invalidation;
- provider policy;
- retries;
- budgets;
- authorization;
- idempotency;
- audit;
- workflow execution.

Do not create Veronica-specific duplicates when shared infrastructure is appropriate.

### Localization

Visual semantics should remain shared across locales where possible.

For localized editions:

1. translate narration;
2. translate captions;
3. translate metadata;
4. translate composited/overlay text;
5. redesign/recompose text-bearing layouts when needed;
6. reuse language-independent imagery;
7. regenerate imagery only when language/content is inseparably embedded or semantic inputs genuinely changed.

A locale change alone must not invalidate language-independent images.

### Aspect ratios

16:9 and 9:16 are independent compositions over shared semantic content.

Do not implement 9:16 as a blind crop/scale of 16:9.

Do not duplicate canonical narration merely because the format changes.

### Source assets

Original sources are immutable.

Crops, redesigns, translations, composites, and other transformations are derived artifacts with provenance.

### Rendering

Preserve compatibility with the repository's FFmpeg-based rendering architecture.

### Provider calls

Cost-bearing provider work must use the shared controls defined by the plan, including as applicable:

- semantic cache fingerprints;
- idempotency;
- bounded retry/backoff;
- concurrency controls;
- authorization;
- budget/policy gates;
- explicit fallback policy;
- provenance;
- fail-closed preflight.

---

## 4. Worktree safety

The repository may contain pre-existing work from another agent/session.

Before any implementation:

```bash
git status --short
git rev-parse HEAD
```

Record:

- starting HEAD;
- all pre-existing modified/untracked paths.

Never:

- reset;
- hard reset;
- stash automatically;
- checkout/restore unrelated files;
- discard unrelated modifications;
- run cleanup commands over unrelated paths;
- stage with `git add .`;
- stage with `git add -A`;
- rewrite unrelated formatting;
- "fix" unrelated lint;
- modify another agent's task merely because you notice it.

Treat every pre-existing changed path as foreign unless the current planned task explicitly owns that path.

If a planned task needs a file already modified by another session:

1. inspect the current diff;
2. preserve unrelated edits;
3. make the smallest compatible change;
4. record the overlap in the task checkpoint;
5. do not overwrite another agent's work.

If safe integration is not possible, mark only that task blocked and continue other dependency-independent tasks.

---

## 5. Implementation state tracking

Use the repository's existing task/checkpoint convention if one exists.

Otherwise maintain:

`docs/plans/veronicabenini-strategic-reinvention-implementation/IMPLEMENTATION-CHECKPOINT.md`

Track at minimum:

- current HEAD;
- task status;
- wave status;
- task owner;
- files changed;
- validations run;
- validation result;
- git checkpoint/commit if created;
- blockers;
- deviations from plan;
- next executable tasks.

Allowed task states:

- NOT_STARTED
- IN_PROGRESS
- IMPLEMENTED
- VALIDATED
- BLOCKED
- DEFERRED_BY_PLAN

Do not mark a task complete merely because code was written.

A task is complete only when its acceptance criteria and affected-scope validation are satisfied.

---

## 6. Task execution algorithm

For each wave:

### Step A — Read only what is needed

Read:

- the wave definition;
- executable task files;
- directly relevant architecture decisions;
- current implementation files required by those tasks.

Do not reread the entire plan or repository.

### Step B — Verify dependency state

Before starting a task, verify:

- all required predecessor tasks are complete;
- shared-schema owners have landed required changes;
- no active task owns overlapping high-contention files;
- required contracts actually exist.

### Step C — Assign work

Prefer one coordinator-owned task for high-contention shared contracts.

Parallelize only tasks explicitly marked safe or clearly disjoint under the plan.

### Step D — Implement minimally

Implement the acceptance criteria without speculative scope expansion.

Prefer:

- extension over replacement;
- reuse over duplication;
- typed contracts over ad-hoc objects;
- deterministic transformations over implicit state;
- repository conventions over new abstractions;
- small patches over broad rewrites.

### Step E — Validate affected scope

Run the smallest test/typecheck/build set that proves the task.

### Step F — Review diff

Inspect:

```bash
git diff -- <owned paths>
```

Check for:

- accidental scope expansion;
- unsafe type assertions;
- duplicate domain models;
- hidden behavior changes;
- unhandled error paths;
- authorization regressions;
- cache/invalidation errors;
- migration incompatibilities;
- excessive provider calls;
- unrelated formatting churn.

### Step G — Record checkpoint

Update implementation status before moving on.

### Step H — Git checkpoint

When the completed task/wave can be isolated safely, create a scoped commit.

Then continue automatically.

---

## 7. Git checkpoint policy

Create safe commits after coherent implementation units.

Preferred granularity:

- canonical shared-contract owner task: its own commit;
- independent implementation task: one commit when cleanly isolatable;
- tightly coupled small tasks: one wave-level commit if their diffs cannot be safely separated.

Never include pre-existing unrelated changes.

Stage only explicit owned paths, for example:

```bash
git add path/to/file-a path/to/file-b path/to/test
git diff --cached --stat
git diff --cached
```

Before committing verify the staged diff contains only intended task changes.

Use commit subjects such as:

```text
feat(veronica): add canonical genre compatibility contract
feat(youtube): extend source manifests for multimedia lineage
feat(youtube): add dependency-aware artifact invalidation
feat(veronica): add locale-aware composition derivatives
test(veronica): cover localized visual reuse invariants
```

Do not push.

Do not rewrite history.

Do not amend commits belonging to another session.

If the dirty worktree prevents a clean commit but implementation is otherwise safe:

- record the task as validated;
- record the exact changed paths;
- leave it uncommitted;
- continue only when later tasks do not depend on ambiguous ownership.

---

## 8. First dependency barrier

Follow the planned first task exactly.

The canonical identity/contracts task is the initial shared-schema owner.

Complete and validate it before beginning the first parallel set.

After that barrier is satisfied, the planned first safe parallel set is:

1. lifecycle persistence/API;
2. source ingestion/manifests;
3. workflow artifact lineage/invalidation.

Use exact task IDs from `dependency-waves.md`.

Do not invent IDs from this prompt.

If the materialized plan specifies a more precise order, the plan wins.

---

## 9. Parallel-agent policy

Use subagents only when they reduce elapsed work without increasing merge risk.

Maximum concurrent implementation workers: **3**.

The coordinator remains responsible for:

- dependency decisions;
- shared architecture;
- high-contention contracts;
- reviewing worker diffs;
- validation decisions;
- checkpoint state;
- commits;
- resolving integration conflicts.

### Good subagent tasks

Delegate when:

- task is marked `SAFE_PARALLEL`;
- owned paths are disjoint;
- contracts required by the task are already stable;
- acceptance criteria are bounded;
- validation is local.

### Bad subagent tasks

Do NOT delegate concurrently when tasks touch:

- Prisma/schema ownership;
- canonical episode/revision models;
- shared OpenAPI contracts;
- central genre registries;
- shared provider registries;
- common workflow event schemas;
- central artifact schemas;
- canonical invalidation graph definitions;
- shared migration files;
- the same large service;
- the same public contract.

These require one explicit write owner.

### Worker instructions

Every worker receives:

- exact task ID;
- task file path;
- owned paths;
- forbidden paths;
- dependencies already satisfied;
- acceptance criteria;
- exact validation scope;
- instruction to avoid commits unless coordinator explicitly delegates commit ownership.

Workers must not perform broad repository exploration.

Workers must return:

- files changed;
- concise implementation summary;
- validation commands/results;
- unresolved issues;
- any discovered contract mismatch.

---

## 10. Token-control policy

Optimize for successful completion per token, not minimal reasoning at the expense of rework.

### Do

- use `rg`, symbol search, imports, manifests, and targeted reads;
- read task files only when executable;
- reuse previous coordinator findings;
- preserve short checkpoint summaries;
- use focused test commands;
- delegate bounded independent tasks;
- inspect existing abstractions before creating new ones;
- use existing fixtures where possible.

### Do not

- repeatedly inspect the full repository;
- reread large planning documents every wave;
- dump full files into reasoning context unnecessarily;
- run repository-wide tests after every task;
- regenerate snapshots/fixtures unrelated to the task;
- launch multiple agents to investigate the same question;
- ask subagents for long narrative reports;
- create speculative documentation unrelated to completion;
- rewrite stable implementations to make them stylistically uniform.

When a repository search answers a question, stop searching.

---

## 11. Validation policy

Use risk-based, affected-scope validation throughout implementation.

### During each task

Run only tests/checks needed to prove affected behavior.

Examples:

- targeted unit tests;
- package-level typecheck;
- targeted integration tests;
- schema validation;
- contract validation;
- migration validation;
- specific render fixture;
- specific CLI/API test.

Do NOT automatically run:

- full monorepo test suite;
- full repository build;
- all integration tests;
- all render fixtures;
- all localization fixtures;
- all database tests.

### Escalate validation when

A task changes:

- canonical persisted schemas;
- public API contracts;
- shared invalidation logic;
- cross-genre behavior;
- authorization;
- publishing;
- migration behavior;
- rendering primitives;
- provider policy shared by multiple genres.

Even then, prefer affected packages/consumers before repository-wide execution.

### Final acceptance

Only after all implementation tasks are complete:

1. execute the final acceptance validation explicitly required by the plan;
2. run broader validation only where the plan or changed dependency graph justifies it;
3. avoid unrelated expensive suites that provide no additional confidence.

If a full suite is known to be prohibitively slow or flaky and is not required by the plan, document why it was not run.

---

## 12. Database and migration safety

For schema work:

- use the repository's canonical migration mechanism;
- never edit already-applied immutable migration history unless repository policy explicitly permits it;
- do not drop data;
- do not reset databases;
- do not run destructive production-like commands;
- preserve backward compatibility when staged rollout requires it;
- add indexes intentionally;
- assess uniqueness/nullability/backfill semantics;
- make migration ordering explicit.

For new persistence used by cache/invalidation/lineage:

- define ownership;
- define lifecycle/retention;
- ensure keys support intended lookup paths;
- avoid unbounded JSON blobs when typed/indexed structure is required;
- preserve tenant boundaries where applicable.

---

## 13. Type-safety expectations

Do not weaken the TypeScript architecture to move faster.

Avoid:

- `any`;
- broad `unknown as T`;
- non-null assertions hiding invariant violations;
- unchecked string unions;
- duplicate DTO/domain types;
- unvalidated external payloads;
- swallowed promise rejections;
- fire-and-forget async work without explicit lifecycle handling.

Prefer:

- discriminated unions;
- branded/opaque identifiers where already used;
- schema-derived types;
- exhaustive switches;
- explicit result/error models;
- typed provider capability contracts;
- immutable revision identifiers;
- explicit cache-key structures;
- validated boundary inputs.

If a local unsafe cast is truly unavoidable, isolate it at the boundary and document why.

---

## 14. Reliability requirements

For async/provider workflows ensure:

- idempotency;
- timeout policy;
- bounded retries;
- backoff/jitter where appropriate;
- error classification;
- cancellation/abort propagation where architecture supports it;
- correlation IDs;
- safe replay;
- duplicate-event tolerance;
- observable terminal states.

Do not leave a workflow in an ambiguous "running forever" state after a terminal provider/runtime failure.

---

## 15. Cache and invalidation requirements

Caching must be semantic, not merely path-based.

Relevant cache fingerprints should include only inputs that actually affect the artifact, such as:

- source content hashes;
- canonical revision;
- narration revision;
- locale when relevant;
- aspect ratio when relevant;
- visual semantics;
- model/provider identity;
- effective provider settings;
- prompt/schema versions;
- camera/image direction revision;
- reference-image fingerprint;
- render/composition settings.

Do NOT include locale in language-independent image cache keys unless locale semantically changes the image.

Do NOT invalidate source extraction because output language changed.

Do NOT invalidate shared images because TTS voice changed.

Do invalidate render/audio timing derivatives when narration timing materially changes.

Add tests for these invariants where planned.

---

## 16. Camera/image direction requirements

The episode-level camera/image settings derivation must:

- consider relevant year/time period;
- geography/area;
- topic;
- source context;
- genre visual policy;
- other inputs defined by the plan.

Persist/cache the result.

Regenerating:

- an episode;
- a scene image;
- a render;
- a localized edition

must not repeat the direction-generation provider call when the semantic inputs are unchanged.

Ensure invalidation is tied to relevant dependencies, not generic episode regeneration.

---

## 17. Reference-image requirements

Reference images are attached to image-generation inputs only when semantically relevant.

Do not attach every available reference image to every prompt.

Selection should be explicit, deterministic enough to audit, and provenance-bound.

Preserve shared infrastructure appropriate for historical/person/entity reference media rather than creating a Veronica-only mechanism unless the plan explicitly requires it.

---

## 18. Source/multimedia requirements

Support the source classes required by the plan using the canonical source manifest.

Relevant behavior includes:

- PDFs;
- presentations;
- documents;
- images;
- screenshots;
- extracted text;
- reusable visual regions/assets.

Originals remain immutable.

Derived artifacts must record lineage.

Context-only/forbidden-for-display source policy must be enforced at output boundaries.

A source extraction failure should not corrupt valid source entries.

Content-hash-equivalent input should reuse valid extraction results.

---

## 19. Narration requirements

The system may adapt narration.

Ensure:

- narration and production metadata remain separate;
- TTS receives a clean spoken payload;
- narration revision is explicit;
- material edits invalidate timing-dependent outputs;
- irrelevant metadata edits do not;
- localized narration is a derivative of the canonical semantic content;
- duration targets are enforced using existing repository policy rather than fragile character-count heuristics.

---

## 20. Localization requirements

Implement localization as shared semantic content plus locale-specific derivatives.

Explicitly distinguish:

- canonical semantics;
- source-language narration;
- localized narration;
- localized captions;
- localized metadata;
- localized text overlays;
- language-independent images;
- localized slide/layout derivatives;
- localized audio;
- localized renders.

Add regression coverage proving that localizing an episode does not regenerate unchanged language-independent visual assets.

---

## 21. 16:9 / 9:16 requirements

Use shared semantic inputs.

Composition-specific artifacts may differ in:

- crop;
- layout;
- text placement;
- typography;
- safe areas;
- source-slide redesign;
- scene framing.

Do not duplicate image generation when the same visual asset works for both formats.

Do not force the same composition when independent framing is required.

Add or preserve mobile-readability checks where defined by the plan.

---

## 22. Approval and remediation requirements

Approval must reference immutable revision/artifact identity.

Rejection/remediation should invalidate the smallest valid dependency scope.

A reviewer should be able to compare:

- old artifact;
- new artifact;
- reason for regeneration;
- inputs that changed;
- reused artifacts.

Do not mutate previously approved history.

Publishing must require the configured approval state.

---

## 23. API and CLI parity

CLI and API must route through canonical application/workflow services.

Do not implement business logic twice.

External interfaces may adapt transport concerns but must share:

- authorization;
- idempotency;
- lifecycle state;
- provider policy;
- validation;
- approval;
- publishing;
- audit;
- persistence semantics.

Keep public contracts versioned and backward-compatible according to existing repository conventions.

---

## 24. Bulk production requirements

Bulk execution must support:

- bounded concurrency;
- partial success;
- resumability;
- per-episode failure isolation;
- provider limits;
- cache reuse;
- deduplication;
- aggregate status;
- aggregate approval packs without hiding per-episode defects.

Do not make the entire batch transactional if the architecture intends independent episode completion.

---

## 25. Security requirements

Treat uploaded/source content as untrusted.

Preserve or add, where relevant:

- authorization checks;
- tenant ownership checks;
- MIME/content validation;
- path traversal protection;
- safe archive/file handling;
- size/resource limits;
- provider secret redaction;
- audit events;
- fail-closed publishing;
- fail-closed paid-provider authorization.

Never place secrets in:

- logs;
- generated approval packs;
- fixtures;
- committed configuration;
- exception messages returned through public APIs.

---

## 26. Observability requirements

New workflows should integrate with existing observability.

Prefer structured fields such as:

- episode ID;
- revision ID;
- production run ID;
- task/stage;
- locale;
- aspect ratio;
- provider;
- attempt;
- cache hit/miss;
- invalidation reason;
- correlation ID.

Avoid high-cardinality metric labels containing arbitrary user/source text.

Do not log raw source documents or provider secrets.

---

## 27. Handling plan/repository drift

If the repository changed after planning:

### Minor drift

Examples:

- file moved;
- symbol renamed;
- helper already implemented;
- test convention changed.

Adapt implementation and record the deviation.

Do not stop.

### Material drift

Examples:

- planned canonical schema was replaced;
- another agent implemented the same task differently;
- migration ownership conflicts;
- plan assumes an API no longer exists;
- proceeding would create duplicate production authorities.

Then:

1. inspect only the relevant current architecture;
2. choose the smallest compatible rebase of the task;
3. document the decision;
4. continue when architecture invariants remain satisfied.

Stop only if two genuinely incompatible architectural/product choices require external authority.

---

## 28. Handling failing pre-existing tests

When an affected validation fails:

1. determine whether the failure is caused by current changes;
2. rerun only enough to prove causality;
3. fix failures caused by the task;
4. do not repair unrelated pre-existing failures unless required for the task;
5. record unrelated failures precisely.

A pre-existing unrelated failure is not automatically a blocker.

---

## 29. No opportunistic scope expansion

Do not implement unrelated ideas discovered while working.

Instead record useful out-of-scope findings in:

`docs/plans/veronicabenini-strategic-reinvention-implementation/IMPLEMENTATION-FOLLOWUPS.md`

Keep entries concise:

- finding;
- evidence;
- impact;
- suggested future task.

Do not turn findings into implementation unless they block planned acceptance criteria.

---

## 30. Wave completion gate

A wave is complete when:

- all non-deferred tasks in the wave are validated;
- dependencies for the next wave are satisfied;
- high-contention shared schemas are stable;
- implementation checkpoint is current;
- no unresolved task-local regression remains;
- safe git checkpoint(s) have been created where possible.

Then begin the next wave automatically.

Do not wait for user approval between waves.

---

## 31. Final integration review

After all 26 planned tasks are implemented:

### Architecture review

Verify:

- only one canonical Veronica genre identity;
- no parallel strategic-reinvention subsystem;
- one canonical episode/revision authority;
- immutable derived revision lineage;
- no duplicated shared manifest/invalidation/provider infrastructure;
- CLI/API parity;
- FFmpeg compatibility.

### Localization review

Verify:

- translated narration;
- translated captions;
- translated metadata;
- translated embedded/composited text;
- source-slide redesign where necessary;
- no unnecessary localized image regeneration.

### Cache/invalidation review

Verify explicit regression tests for at least:

- unchanged source extraction reuse;
- camera/image direction reuse;
- image reuse across locale;
- unaffected image reuse after voice-only changes;
- render invalidation after timing change;
- targeted scene regeneration;
- provider fingerprint changes invalidating affected outputs only.

### Operational review

Verify:

- retries bounded;
- idempotency;
- provider policy;
- budget controls;
- failure classification;
- observability;
- bulk partial success;
- resumability.

### Security review

Verify:

- authorization;
- tenant boundaries where applicable;
- source validation;
- secret handling;
- publish fail-closed behavior.

---

## 32. Final validation

Use the acceptance/release validation documented by the implementation plan.

If no explicit final command set exists, derive the smallest defensible final set from changed packages.

Include:

- relevant package typechecks;
- relevant unit tests;
- relevant integration/contract tests;
- database/schema validation if changed;
- representative Veronica production fixture(s);
- localization reuse regression;
- 16:9 and 9:16 composition checks;
- API/CLI contract checks if changed.

Do not run unrelated repository-wide suites solely for ceremony.

If shared cross-genre code changed, include representative regression coverage for affected other genres, especially history, when those consumers share the modified infrastructure.

---

## 33. Final story coverage reconciliation

Before finishing, reconcile all 81 stories.

For each story, confirm one of:

- IMPLEMENTED_AND_VALIDATED;
- ALREADY_COMPLETE_AND_VERIFIED;
- DEFERRED_BY_APPROVED_PLAN;
- BLOCKED_EXTERNAL.

There must be no silently unaccounted story.

Update the coverage/checkpoint artifacts accordingly.

---

## 34. Final git review

Before final response:

```bash
git status --short
git log --oneline --decorate -n 20
```

Review all implementation commits created by this run.

Ensure:

- no unrelated pre-existing changes were committed;
- no secrets entered git;
- no generated bulk artifacts were accidentally committed unless explicitly intended;
- migration files and contracts are present where required;
- documentation reflects final implementation state.

Do not push.

---

## 35. Stop conditions

Do NOT stop for:

- routine lint/type errors caused by your changes;
- an ordinary failed targeted test;
- a task needing a small refactor;
- a minor discrepancy between planned filename and actual filename;
- a safe implementation choice already governed by repository conventions;
- completion of a dependency wave;
- a worker finishing;
- a recoverable provider-independent fixture failure;
- token-saving opportunities that can be addressed through narrower context.

DO stop if:

- continuing risks destroying or overwriting unrelated work;
- a destructive migration is required but not authorized;
- required external credentials/secrets are necessary for implementation rather than optional runtime validation;
- irreversible external publishing would occur;
- a genuine product/architecture choice has two materially incompatible safe solutions and the plan gives no decision;
- all executable work is complete.

If one task becomes genuinely blocked, continue all other dependency-independent planned tasks before stopping.

---

## 36. Final response format

Do not dump implementation details.

Return a concise completion report:

1. **Verdict:** COMPLETE / PARTIAL / BLOCKED
2. **Tasks:** implemented / already-complete / deferred / blocked
3. **Stories:** implemented-or-verified / 81
4. **Waves completed:** X / 9
5. **Commits created:** count + short hashes/subjects
6. **Validation:** pass/fail summary
7. **Architecture invariants:** pass/fail
8. **Localization visual-reuse invariant:** pass/fail
9. **Outstanding blockers:** maximum 5 concise bullets
10. **Pre-existing worktree changes preserved:** yes/no
11. **Files intentionally left uncommitted:** concise list/reason
12. **Recommended next action:** one concise action

If COMPLETE, explicitly state that implementation of the planned Veronica Benini / strategic-reinvention scope is complete.

Do not begin unrelated enhancements after completion.
