# Target Architecture

## Architectural Decision

MediaForge will have one shared workflow engine and separate content profiles.
Entry points delegate to canonical application tasks. They do not construct
production paths, invoke providers directly, infer success from file existence,
or persist alternate workflow state.

This decision extends current source-backed foundations:

- `apps/cli` remains the operator composition root;
- `packages/shared/src/episode-filesystem.ts` remains the starting path-policy
  authority;
- `packages/story-localization/src/story-workflow-*` and
  `packages/math-education/src/orchestration/*` provide characterization and
  migration inputs, not two permanent engines;
- provider and renderer packages retain technical adapters;
- `packages/dark-truth` and `packages/math-education` own profile policy and
  task registration, not generic orchestration.

## Package Boundaries

| Package | Final responsibility |
| --- | --- |
| `packages/domain` | Strict Zod schemas, branded identifiers, discriminated content/profile/task/artifact/workflow/quality contracts. No I/O. |
| `packages/shared` | Hashing, atomic filesystem primitives, containment, redaction, canonical artifact resolver primitives. No production orchestration. |
| `packages/workflow-engine` | New package owning registry, DAG, state/events, attempts, locks, cache decisions, invalidation, approvals, overrides, batches, reconciliation, error normalization, and execution telemetry coordination. |
| `packages/config` | One validated configuration loader, precedence model, defaults, and explain output. |
| capability packages | One canonical application service per story, image, audio, render, metadata, upload, curriculum, verification, or visual task; provider adapters remain infrastructure strategies. |
| `packages/dark-truth` | Dark Truth profile, bibles, continuity, reference requirements, quality policy, and task graph. |
| `packages/math-education` | Mathematics profile, curriculum/pedagogy/correctness policy, lesson task graph, and education visual policy. |
| `apps/cli` | Argument parsing, dependency composition, task invocation, output formatting, and compatibility aliases only. |

`apps/api` and future workers invoke the same engine API. They may not import a
capability implementation to bypass it.

## Content Contract

Use a closed union:

```ts
type ContentProfile =
  | DarkTruthContentProfile
  | MathematicsEducationContentProfile;
```

Both branches include validated `AudienceDefinition`, objective,
`EngagementStrategy`, `QualityGateDefinition`, `HardFailureRule`,
`ScoringDimension`, `VisualPolicy`, `NarrationPolicy`, `LocalizationPolicy`,
`ApprovalPolicy`, `ArtifactRequirement`, and `ReferencePolicy`. Profile IDs are
literals, not free-form strings. Horror and education prompts, scoring weights,
visual rules, pacing, and failure policy remain separate.

## Task Registry

`TaskDefinition` is schema-backed and contains:

- stable ID and implementation version;
- applicable profile literals;
- required and optional dependencies;
- input and output artifact contracts;
- readiness predicate;
- cache, retry, timeout, lock, approval, validation, invalidation, batch,
  provider, and cost policies;
- CLI representation and observability fields;
- execution kind: `deterministic`, `model-assisted`, `provider-dependent`,
  `manual-approval`, or `irreversible`.

Registry startup rejects duplicate IDs, missing dependencies, cycles, invalid
profile applicability, incompatible artifact contracts, unversioned prompts,
and irreversible tasks without approval policy. Task implementations receive a
`TaskExecutionContext`; they never read global CLI options or construct paths.

The public engine interfaces are:

```text
TaskDefinition        TaskExecutionContext   TaskInput
TaskResult            TaskAttempt            TaskDependency
TaskFingerprint       ArtifactRef            ArtifactManifest
WorkflowDefinition    WorkflowInstance       WorkflowEvent
OperatorOverride      ApprovalRecord         BatchManifest
ReferenceImageManifest StoryBibleManifest    EducationalVisualStyleManifest
QualityAssessment     HardFailure            ScoringResult
```

Every interface has a matching strict schema and a schema/implementation
version. JSON is parsed at I/O boundaries; unchecked casts are prohibited.

## Artifact Repository

Commands pass `ArtifactRef` intent containing unit identity, profile, locale,
variant, kind, artifact revision, workflow revision, bible/curriculum revision,
and reference-set revision where applicable. Only the artifact repository maps
that intent to a path.

Existing Dark Truth and mathematics layouts remain distinct. The resolver
supports canonical writes, legacy discovery, conflict reporting, checksums,
atomic temporary writes and promotion, dry-run migration, and rollback plans.
An artifact is valid only when its manifest parses, its file exists, its hash
matches, validation passed, its producer succeeded, and no dependency is stale.

## Workflow State and Events

Each production unit stores workflow data at:

```text
<unit-root>/state/workflow/<workflow-id>/
├── state.json
├── events.jsonl
├── overrides.json
├── approvals.json
├── locks/
└── runs/<run-id>/<attempt-id>.json
```

`state.json` is a rebuildable materialized view. `events.jsonl` is append-only
and authoritative for history. Overrides and approvals are schema-validated,
attributed, reasoned, revision-bound, and reflected through events. `next` is
derived from graph, task states, artifacts, cache, locale/variant, approvals,
invalidations, and overrides.

Task states are `pending`, `ready`, `blocked`, `running`, `succeeded`, `failed`,
`interrupted`, `skipped`, `invalidated`, and `awaiting-approval`. Impossible
transitions fail closed. Manual success requires an override reason and cannot
override non-overridable mathematical or publish-approval failures.

## Idempotency and Invalidation

Fingerprints hash normalized relevant inputs:

- task version and validated configuration;
- input artifact manifests and hashes;
- prompt/schema/profile versions;
- provider, model, parameters, and tool versions;
- locale, variant, workflow profile, and renderer version;
- Dark Truth bible and reference revisions;
- mathematics curriculum and visual-style revisions.

A cache hit requires a matching successful attempt, valid output manifests,
present hash-valid outputs, passed validation, and no invalidation or stale
dependency. File existence alone is never a hit.

Invalidation follows declared artifact edges. A Dark Truth reference replacement
invalidates dependent visuals, thumbnails, and renders but not unrelated story
text. A mathematics objective or curriculum change invalidates lesson content,
examples, exercises, visuals, narration, and rendering according to the graph.

## Reliability and Batching

Use per-unit and per-task file locks, atomic state writes, append-only events,
temporary output files, validation before promotion, and attempt records. On
startup, reconciliation detects stale locks/runs and valid outputs created
before state persistence. Heartbeats are added only for tasks whose normal
duration exceeds the stale-lock threshold.

Batch manifests contain deterministic item IDs and item-level state. Normal task
implementations execute each item. Successful items are never regenerated after
partial failure. Grouping by provider, model, locale, variant, and operation is
an execution optimization, not a second business implementation. Concurrency,
retry, and rate limits come from validated config.

## Quality Contract

Scores use integer dimensions from 0 to 100, declared weights summing to 100,
dimension evidence, warnings, and separate hard failures. Aggregate score cannot
mask a hard failure.

| Status | Machine semantics |
| --- | --- |
| `READY` | No hard failures, weighted score >= 85, every required dimension >= 70, no edits required. |
| `READY_WITH_MINOR_EDITS` | No hard failures, weighted score >= 75, only enumerated bounded edits; approval required before publish. |
| `REVISION_REQUIRED` | Fixable deficiencies without replacing the core content contract. |
| `REWRITE_REQUIRED` | Foundational narrative, lesson, localization, or structure contract must be regenerated. |
| `BLOCKED` | Missing/corrupt dependency, approval, reference, curriculum evidence, correctness evidence, or workflow conflict. |

Reason codes are profile-prefixed literals such as
`DARKTRUTH_SUPERNATURAL_RULE_UNCLEAR`, `DARKTRUTH_REFERENCE_SET_MISSING`,
`MATH_SYMBOLIC_RESULT_UNVERIFIED`, `MATH_ANSWER_KEY_MISMATCH`, and shared codes
such as `ARTIFACT_INVALID`, `LOCALIZATION_BROKEN`, and
`PUBLISH_APPROVAL_MISSING`.

## CLI Contract

```text
mediaforge episode {list,status,next,graph,plan,run-next,run,resume,reconcile,retry-failed,invalidate,validate-state,override}
mediaforge episode publish {dry-run,approve,run}
mediaforge lesson {list,status,next,graph,plan,run-next,run,resume,reconcile,retry-failed,invalidate,validate-state,override}
mediaforge lesson publish {dry-run,approve,run}
mediaforge task {list,explain,run}
mediaforge batch {plan,run,status,resume,reconcile,cancel}
mediaforge artifact {list,verify,migrate}
mediaforge bible {validate,diff}
mediaforge references {status,approve,invalidate}
mediaforge cache {inspect,explain-miss,prune}
mediaforge workflow validate
mediaforge config explain
mediaforge doctor
```

`run-next` runs one task unless `--continue` is explicit. Commands support
consistent `--json`, actionable errors, and side-effect-free `--dry-run` where
meaningful. Help examples are generated from task metadata. Existing command
families remain temporary aliases that delegate to canonical tasks.

Stable exit codes are `0` success/ready, `1` input/config/schema, `2` approval or
minor edits required, `3` blocked gate/partial batch, `4` exhausted transient
provider failure, `5` workflow/lock/persistence/cache conflict, `6` permanent
provider or artifact-validation failure, and `130` interruption.

## Observability

Workflow events contain state-changing facts. Structured operational logs
contain runtime diagnostics. Provider debug logs contain redacted request and
response metadata. Artifact manifests contain durable lineage and hashes.
CLI output is a projection of these stores.

Every attempt records run, batch, unit, profile, task, attempt, locale, variant,
provider/model/request ID, cache state, duration, fingerprint, bible/reference or
curriculum revision, outputs, warnings, normalized errors, exit code, token use,
and estimated/actual cost. Secrets, authentication, binaries, large base64, and
unnecessary personal data are excluded.

