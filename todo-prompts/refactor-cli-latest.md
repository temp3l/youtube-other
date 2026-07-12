# Codex Task: Audit and Plan a Unified MediaForge CLI and Episode Workflow Architecture

Act as a Principal Platform Engineer and CLI/Workflow Architecture Specialist with extensive experience in:

- TypeScript and Node.js monorepos
- media-generation pipelines
- resumable and idempotent workflows
- filesystem and artifact management
- CLI usability and command design
- state machines and workflow orchestration
- migration of legacy implementations
- production-safe refactoring
- observability, auditability, and failure recovery

Your task is to analyze the existing MediaForge codebase and produce a detailed, implementation-ready refactoring plan.

Do not implement the refactoring yet.

The primary goals are:

1. Identify and eliminate duplicate implementations used by Codex-driven workflows and command-line workflows.
2. Standardize all filesystem paths, output filenames, artifact naming rules, and directory layouts.
3. redesign the CLI so it is easier to understand, discover, and use.
4. Introduce a persistent, editable workflow-state file for every episode.
5. Enable commands such as:

```bash
npm run mediaforge -- workflow next --episode 025
npm run mediaforge -- workflow run-next --episode 025
npm run mediaforge -- workflow status --episode 025
npm run mediaforge -- workflow resume --episode 025
```

The final output of this task must be a set of Markdown planning documents. Do not modify production code unless explicitly instructed in a later task.

---

# 1. Problem Context

The current system appears to use different implementations depending on whether media generation is triggered through:

- Codex-assisted development workflows
- direct CLI commands
- npm scripts
- pipeline orchestration commands
- individual generation commands
- batch-processing commands
- resume or regeneration commands

This appears to cause inconsistencies in:

- output directories
- filenames
- artifact locations
- command behavior
- generated metadata
- status tracking
- retry behavior
- completion detection
- resume behavior
- validation logic

Examples of affected artifact types include:

- rewritten stories
- localized stories
- short scripts
- audio files
- scene plans
- shot plans
- generated images
- thumbnails
- rendered clips
- final videos
- YouTube metadata
- playlists
- debug logs
- OpenAI request and response logs

The system must ultimately have one canonical implementation for each capability.

CLI commands, Codex instructions, batch processors, and workflow orchestration must call the same application services rather than implementing their own path, naming, or generation logic.

---

# 2. Required Investigation

Perform a repository-wide audit.

Do not rely only on obvious CLI entry points.

Search for all implementations that:

- build episode paths
- construct filenames
- resolve language directories
- resolve full-video versus Shorts directories
- write generated files
- read generated files
- detect whether an artifact exists
- decide whether a workflow step is complete
- invoke story rewriting
- invoke localization
- invoke audio generation
- invoke image generation
- invoke thumbnail generation
- invoke rendering
- invoke metadata generation
- invoke batch APIs
- download batch results
- process batch results
- resume failed processing
- retry failed work
- skip existing outputs
- create debug logs
- write production-state files
- write cache files
- validate episode completeness

Inspect at least:

- CLI entry points
- npm scripts
- package.json scripts
- command registries
- command handlers
- service classes
- orchestration layers
- batch-processing modules
- Codex-specific scripts or instructions
- shell scripts
- migration scripts
- episode utilities
- path helpers
- naming helpers
- configuration loaders
- providers
- test fixtures
- integration tests
- simulation mode
- dry-run mode
- resume commands
- regeneration commands

For every implementation found, document:

- file path
- exported symbol or command name
- responsibility
- inputs
- outputs
- filesystem behavior
- naming behavior
- whether it duplicates another implementation
- whether it bypasses shared services
- whether it is safe to retain
- proposed canonical replacement

---

# 3. Create an Execution-Path Map

Create a map showing how each user-facing command reaches the underlying implementation.

For each relevant command, document a flow similar to:

```text
npm script
  -> CLI entry point
  -> command parser
  -> command handler
  -> orchestration service
  -> domain/application service
  -> provider
  -> artifact writer
  -> filesystem path
```

Identify where different commands diverge despite performing the same conceptual task.

Pay particular attention to cases where:

- two commands generate the same artifact differently
- Codex instructions call scripts that bypass the canonical CLI
- batch processing writes to different paths than synchronous processing
- resume commands use different filenames than initial generation
- localized content differs structurally from canonical English content
- full videos and Shorts use inconsistent layouts
- simulation mode behaves differently from production mode
- artifact-existence checks do not match artifact-writing behavior

Produce a duplication matrix with columns such as:

| Capability | Implementation A | Implementation B | Path difference | Filename difference | Behavior difference | Recommended canonical implementation |
| ---------- | ---------------- | ---------------- | --------------- | ------------------- | ------------------- | ------------------------------------ |

---

# 4. Define a Canonical Episode Filesystem Contract

Design one canonical filesystem contract for all episode artifacts.

The path contract must be centralized and typed.

No command or service should concatenate episode paths manually.

Recommend a structure appropriate for the existing repository. Preserve existing conventions where they are sound, but remove unnecessary duplication and ambiguity.

Consider a structure such as:

```text
episodes/
  025-example-episode/
    episode.json
    workflow.json

    source/
      original.md

    stories/
      full/
        en.md
        de.md
        es.md
        fr.md
        pt.md
      short/
        en.md
        de.md
        es.md
        fr.md
        pt.md

    audio/
      full/
        en/
        de/
      short/
        en/
        de/

    plans/
      scenes/
      shots/
      retention/

    images/
      full/
      short/
      references/

    thumbnails/
      full/
      short/

    video/
      full/
      short/
      clips/

    metadata/
      youtube/

    batches/
      requests/
      responses/
      errors/

    debug/
      openai/
      workflow/
```

This example is not mandatory.

Base the recommendation on the actual repository and current compatibility requirements.

The filesystem contract should cover:

- episode identifiers
- episode slugs
- canonical language
- localization languages
- full versus short format
- versioned artifacts
- retries
- regenerated artifacts
- temporary files
- intermediate artifacts
- final artifacts
- batch requests
- batch responses
- provider logs
- debug logs
- validation reports
- workflow state
- deprecated legacy paths

Design a typed API such as:

```ts
interface EpisodeArtifactPaths {
  episodeRoot(episode: EpisodeRef): AbsolutePath;
  workflowState(episode: EpisodeRef): AbsolutePath;
  story(input: StoryArtifactRef): AbsolutePath;
  audio(input: AudioArtifactRef): AbsolutePath;
  image(input: ImageArtifactRef): AbsolutePath;
  thumbnail(input: ThumbnailArtifactRef): AbsolutePath;
  video(input: VideoArtifactRef): AbsolutePath;
  metadata(input: MetadataArtifactRef): AbsolutePath;
}
```

Recommend branded path types or an equivalent safe approach where appropriate.

Examples:

```ts
type AbsolutePath = string & { readonly __brand: "AbsolutePath" };
type EpisodeId = string & { readonly __brand: "EpisodeId" };
type LanguageCode = "en" | "de" | "es" | "fr" | "pt";
type MediaFormat = "full" | "short";
```

All path generation should be deterministic and side-effect free.

---

# 5. Canonical Artifact Registry

Evaluate whether the application should introduce an artifact registry.

The registry should define every artifact type and how it is:

- named
- located
- generated
- validated
- considered complete
- invalidated
- regenerated
- depended upon

A possible conceptual model is:

```ts
interface ArtifactDefinition<TArtifactType extends string> {
  readonly type: TArtifactType;
  readonly version: number;
  readonly dependencies: readonly ArtifactType[];
  resolvePath(context: ArtifactContext): AbsolutePath;
  validate(context: ArtifactContext): Promise<ArtifactValidationResult>;
}
```

Determine whether this abstraction fits the existing codebase or would be excessive.

Prefer the smallest abstraction that reliably prevents path and naming divergence.

---

# 6. Workflow-State File

Design a persistent workflow-state file for each episode.

The user must be able to inspect and manually edit it when necessary.

A file named `workflow.json` or `workflow-state.json` should live in the episode root unless repository analysis identifies a better location.

The file must answer:

- What has completed?
- What is currently running?
- What failed?
- What was skipped?
- What was manually overridden?
- What is stale?
- What should run next?
- Which exact CLI command can execute the next step?
- Which artifacts were produced?
- Which dependencies block a step?
- When was each step attempted?
- Which implementation version produced an artifact?

Do not use only `done` and `next` arrays internally if a richer state model is needed.

The user-facing JSON can remain simple while the schema supports robust execution.

Recommend a schema similar to:

```json
{
  "schemaVersion": 1,
  "episode": {
    "id": "025",
    "slug": "example-episode"
  },
  "updatedAt": "2026-07-12T18:00:00.000Z",
  "revision": 14,
  "workflow": "default-youtube-episode",
  "steps": [
    {
      "id": "story.rewrite.full.en",
      "task": "stories-rewrite",
      "status": "completed",
      "startedAt": "2026-07-12T17:40:00.000Z",
      "completedAt": "2026-07-12T17:42:00.000Z",
      "exitCode": 0,
      "attempt": 1,
      "command": "npm run mediaforge -- story rewrite --episode 025 --language en --format full",
      "artifacts": ["stories/full/en.md"],
      "errors": [],
      "warnings": [],
      "implementationVersion": "story-rewrite-v2"
    },
    {
      "id": "audio.generate.full.en",
      "task": "audio-generate",
      "status": "pending",
      "command": "npm run mediaforge -- audio generate --episode 025 --language en --format full",
      "dependsOn": ["story.rewrite.full.en"],
      "blockedBy": []
    }
  ],
  "summary": {
    "done": [
      {
        "task": "stories-rewrite",
        "date": "2026-07-12T17:42:00.000Z",
        "exitCode": 0,
        "errors": [],
        "cliCommand": "npm run mediaforge -- story rewrite --episode 025 --language en --format full"
      }
    ],
    "next": [
      {
        "task": "audio-generate",
        "cliCommand": "npm run mediaforge -- audio generate --episode 025 --language en --format full"
      }
    ]
  }
}
```

The `summary.done` and `summary.next` fields may be derived rather than treated as the source of truth.

Explicitly recommend which fields are canonical and which are projections.

---

# 7. Workflow Step States

The state model should support at least:

```ts
type WorkflowStepStatus =
  | "pending"
  | "ready"
  | "running"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "blocked"
  | "skipped"
  | "stale"
  | "cancelled"
  | "manually_completed";
```

Define precise state-transition rules.

Examples:

```text
pending -> ready
ready -> running
running -> completed
running -> completed_with_warnings
running -> failed
failed -> ready
completed -> stale
blocked -> ready
pending -> manually_completed
```

Prevent invalid transitions unless an explicit force or repair command is used.

Explain how process crashes should be handled when a step remains in `running`.

Recommend a lease, heartbeat, process ID, execution ID, or stale-run timeout where appropriate.

---

# 8. Manual Editing and Reconciliation

The workflow file must be manually editable, but manual edits must not silently corrupt the system.

Design commands such as:

```bash
npm run mediaforge -- workflow validate --episode 025
npm run mediaforge -- workflow reconcile --episode 025
npm run mediaforge -- workflow repair --episode 025
npm run mediaforge -- workflow mark-complete --episode 025 --step story.rewrite.full.en
npm run mediaforge -- workflow reset --episode 025 --step audio.generate.full.en
npm run mediaforge -- workflow invalidate --episode 025 --from story.rewrite.full.en
```

Define how reconciliation works.

It should compare:

1. workflow-state claims
2. actual filesystem artifacts
3. artifact validation results
4. dependency state
5. relevant configuration hashes
6. prompt or implementation versions where available

Examples:

- State says completed, but artifact is missing: mark `stale` or `failed_validation`.
- Artifact exists, but state says pending: offer to import or mark complete.
- Story changed after audio generation: audio becomes stale.
- Scene plan changed after images were generated: affected images become stale.
- A file was manually corrected: allow explicit adoption of the modified artifact.
- A user manually marks a step complete: validate the expected artifacts unless `--force` is used.

Do not automatically destroy manually edited files.

---

# 9. Dependency Graph

Model the episode workflow as a directed acyclic graph rather than a hardcoded linear script where practical.

An illustrative flow may include:

```text
source
  -> source analysis
  -> story rewrite EN full
  -> story quality check
  -> localization full
  -> short rewrite
  -> short localization
  -> audio generation
  -> scene planning
  -> shot planning
  -> image generation
  -> thumbnail generation
  -> rendering
  -> metadata generation
  -> validation
  -> publishing preparation
```

The actual graph must be derived from the repository.

Account for:

- multiple languages
- full and short formats
- independent branches
- optional steps
- playlist assignment
- thumbnail generation
- audio regeneration
- render-only workflows
- image resume workflows
- batch workflows
- simulation mode
- provider availability
- partial failures

A failed German audio step must not unnecessarily block English image generation if no dependency exists.

A failed image must not prevent unrelated images from being generated.

The workflow engine should record partial completion and expose the precise next executable steps.

---

# 10. Workflow Execution Semantics

Design semantics for these commands:

```bash
mediaforge workflow status --episode 025
mediaforge workflow next --episode 025
mediaforge workflow run-next --episode 025
mediaforge workflow run --episode 025
mediaforge workflow resume --episode 025
mediaforge workflow plan --episode 025
mediaforge workflow graph --episode 025
mediaforge workflow reconcile --episode 025
```

Recommended behavior:

## `workflow status`

Show:

- overall episode status
- completed steps
- failed steps
- blocked steps
- stale steps
- ready steps
- next recommended command
- artifact summary
- warnings

## `workflow next`

Return the next recommended step without executing it.

Support machine-readable output:

```bash
mediaforge workflow next --episode 025 --json
```

## `workflow run-next`

Execute one ready step.

The selection algorithm must be deterministic and documented.

Support:

```bash
--step
--language
--format
--dry-run
--force
--retry-failed
--continue-on-error
```

## `workflow run`

Execute all runnable steps until:

- completion
- a blocking failure
- a configured boundary
- the requested target step is reached

Example:

```bash
mediaforge workflow run --episode 025 --until render.full.en
```

## `workflow resume`

Reconcile state and continue from incomplete or failed work.

It must not blindly regenerate completed valid artifacts.

## `workflow plan`

Print the calculated execution plan without changing anything.

## `workflow graph`

Display dependency relationships in text, JSON, Mermaid, or Graphviz-compatible output.

---

# 11. CLI Audit and Redesign

Audit the complete current CLI command hierarchy.

Document:

- current commands
- aliases
- npm scripts
- hidden or undocumented commands
- overlapping commands
- inconsistent verbs
- inconsistent option names
- commands that behave differently despite similar names
- commands with too many positional arguments
- commands that expose internal implementation details
- commands that cannot be discovered through help output
- commands that bypass workflow state
- commands that are unsafe to rerun
- commands that are not idempotent
- commands that do not support dry-run
- commands that do not produce machine-readable output

Design a consistent command grammar.

Prefer a structure like:

```bash
mediaforge <domain> <verb> [options]
```

Potential domains:

```text
episode
workflow
story
audio
plan
image
thumbnail
video
metadata
batch
validate
debug
config
```

Potential examples:

```bash
mediaforge episode create
mediaforge episode inspect
mediaforge episode validate

mediaforge story rewrite
mediaforge story localize
mediaforge story validate

mediaforge audio generate
mediaforge audio regenerate
mediaforge audio validate

mediaforge image generate
mediaforge image resume
mediaforge image validate

mediaforge thumbnail generate
mediaforge video render
mediaforge metadata generate

mediaforge workflow status
mediaforge workflow next
mediaforge workflow run-next
mediaforge workflow run
mediaforge workflow resume
```

Avoid inconsistent patterns such as:

```text
stories rewrite-full
generate-audio
resume-images
metadata youtube
render --profile youtube
```

unless compatibility requires keeping them temporarily as aliases.

Recommend a canonical naming scheme and a deprecation strategy.

---

# 12. Flow-Based CLI UX

The CLI should support both expert users and guided operation.

Recommend a flow-based mode such as:

```bash
mediaforge episode continue --episode 025
```

or:

```bash
mediaforge workflow run-next --episode 025
```

The CLI should explain:

- what was detected
- what is already complete
- what is missing
- what will happen next
- which files will be read
- which files will be written
- whether paid providers will be called
- estimated number of provider calls where possible
- which command to run afterward

Example output:

```text
Episode 025: The Endless Backrooms

Completed:
  ✓ English full story
  ✓ Story quality gate
  ✓ German localization

Ready:
  → Generate English full audio

Blocked:
  - German full audio
    Missing dependency: German story validation

Next command:
  npm run mediaforge -- workflow run-next --episode 025

Expected output:
  episodes/025-the-endless-backrooms/audio/full/en/narration.mp3
```

Support:

```bash
--quiet
--verbose
--json
--no-color
--dry-run
```

All errors should include:

- what failed
- why it failed
- whether retry is safe
- state-file location
- log-file location
- suggested recovery command

---

# 13. Single Application-Service Layer

Design the refactoring so that all entry points call one canonical application layer.

The target architecture should resemble:

```text
CLI / npm scripts / Codex / tests / batch workers
                    |
                    v
            application services
                    |
                    v
              domain services
                    |
                    v
     providers / filesystem / renderers
```

The CLI must not contain domain logic.

npm scripts must not encode artifact paths.

Codex instructions must invoke documented CLI commands or application-level scripts rather than writing files directly.

Batch workers must use the same artifact-path resolver and workflow-state writer as synchronous commands.

Recommend concrete module boundaries based on the actual repository.

Possible modules:

```text
src/
  application/
    workflow/
    story/
    audio/
    image/
    render/

  domain/
    episode/
    workflow/
    artifacts/

  infrastructure/
    filesystem/
    providers/
    persistence/

  cli/
    commands/
    presenters/
```

Do not impose this exact structure if the repository already has a better architectural convention.

---

# 14. Workflow Persistence and Concurrency Safety

The workflow file may be accessed by multiple processes.

Design protections against:

- concurrent writes
- truncated JSON
- stale updates
- two workers executing the same task
- lost updates
- process crashes
- duplicate provider calls
- partial artifact writes

Recommend:

- atomic write-to-temp and rename
- revision numbers
- optimistic locking
- per-episode lock files
- execution IDs
- task leases
- stale-lock detection
- checksums where appropriate

Example safe persistence flow:

```text
read state
validate schema
verify revision
acquire episode lock
write temporary state file
fsync if appropriate
atomic rename
release lock
```

Assess what level of safety is justified for the current application.

---

# 15. Idempotency

Every workflow step should explicitly define its idempotency behavior.

For each step, document:

- whether rerunning is safe
- what causes a skip
- what causes regeneration
- whether output is overwritten
- whether old output is archived
- how a partial output is detected
- how provider requests are deduplicated
- how retries are recorded

Recommend an execution contract such as:

```ts
interface WorkflowStepExecutor<TContext> {
  readonly id: WorkflowStepId;

  inspect(context: TContext): Promise<StepInspection>;

  execute(
    context: TContext,
    options: StepExecutionOptions
  ): Promise<StepExecutionResult>;
}
```

The workflow engine should inspect before executing.

---

# 16. Configuration and Change Detection

Determine how changes to configuration should invalidate existing outputs.

Potential inputs include:

- model
- reasoning effort
- prompt version
- voice
- TTS settings
- speaking rate
- image model
- image size
- aspect ratio
- thumbnail style
- language
- renderer profile
- source script hash
- scene-plan hash
- application version

Recommend storing a reproducibility fingerprint per completed step:

```json
{
  "inputFingerprint": "sha256:...",
  "configFingerprint": "sha256:...",
  "implementationVersion": "audio-generation-v3"
}
```

Do not hash secrets.

Explain which changes should:

- mark a task stale
- require explicit regeneration
- be treated as metadata-only changes
- be ignored

---

# 17. Backward Compatibility and Migration

The repository already contains many episodes and generated artifacts.

Do not recommend a destructive migration.

Produce a migration strategy that includes:

1. detect all existing path variants
2. classify canonical and legacy layouts
3. generate an inventory
4. detect collisions
5. identify duplicate artifacts
6. compare file hashes
7. propose moves
8. provide dry-run output
9. migrate one episode at a time
10. maintain temporary compatibility readers
11. stop writing to legacy paths
12. remove legacy readers only after validation

Recommend commands such as:

```bash
mediaforge migrate inspect-paths
mediaforge migrate episode-layout --episode 025 --dry-run
mediaforge migrate episode-layout --episode 025
mediaforge migrate all-episodes --dry-run
```

The migration must:

- never delete the only copy of an artifact
- preserve timestamps where useful
- record every move
- detect conflicting files
- require explicit resolution for non-identical collisions
- support rollback
- write a migration report

Consider whether symlinks should be avoided for portability.

---

# 18. Compatibility Adapters

Recommend a temporary compatibility layer.

Old commands may remain as deprecated aliases:

```bash
mediaforge stories rewrite-full
```

internally forwarding to:

```bash
mediaforge story rewrite --format full
```

The old command should display:

```text
Deprecated command.

Use:
  mediaforge story rewrite --format full

This alias will be removed after the migration window.
```

Old path readers may temporarily search:

1. canonical path
2. known legacy paths

All new writes must go only to the canonical path.

Document when and how the compatibility layer should be removed.

---

# 19. Error Handling and Observability

Every step execution should produce structured execution information.

Example:

```ts
interface WorkflowExecutionRecord {
  readonly executionId: string;
  readonly stepId: WorkflowStepId;
  readonly command: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly exitCode?: number;
  readonly status: WorkflowStepStatus;
  readonly errors: readonly WorkflowError[];
  readonly warnings: readonly WorkflowWarning[];
  readonly artifacts: readonly ProducedArtifact[];
  readonly logPath?: AbsolutePath;
}
```

Errors should be structured:

```ts
interface WorkflowError {
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
  readonly retryCommand?: string;
  readonly details?: Record<string, unknown>;
}
```

Do not store full secrets, API keys, authorization headers, or base64 image output.

Reference large provider request and response logs by path rather than embedding them into `workflow.json`.

---

# 20. Workflow File Size and History

Avoid allowing `workflow.json` to grow indefinitely.

Evaluate one of these approaches:

## Option A: Current-state file plus append-only event log

```text
workflow.json
debug/workflow/events.jsonl
```

## Option B: Current-state file plus bounded execution history

Keep only the latest N attempts per step.

## Option C: Event-sourced workflow

Use only if justified by the current project complexity.

Prefer a simple current-state file plus JSONL execution history unless repository constraints indicate otherwise.

The manually editable file should remain understandable.

---

# 21. Schema Validation

Use runtime validation for workflow-state files.

Evaluate the repository’s existing validation stack before recommending a library.

Possible options include:

- Zod
- TypeBox
- Valibot
- JSON Schema with Ajv
- an existing internal schema solution

The schema should support:

- versioning
- migrations
- validation errors with JSON paths
- safe parsing
- unknown-field handling
- future compatibility

Generate a JSON Schema where useful so editors can provide autocomplete.

Recommend adding:

```json
{
  "$schema": "../../schemas/mediaforge-workflow.schema.json"
}
```

where the relative location is practical.

---

# 22. Testing Strategy

Produce a thorough test plan.

Include:

## Unit tests

- path resolution
- artifact naming
- dependency resolution
- next-step selection
- valid state transitions
- invalid state transitions
- stale artifact detection
- fingerprint calculation
- command generation
- schema validation

## Integration tests

- CLI command to generated artifact
- synchronous and batch workflows writing identical paths
- resume after partial failure
- process crash recovery
- manual state edits
- migration from legacy paths
- duplicate artifact detection
- dry-run behavior
- simulation mode
- retry behavior
- language-specific flows
- full and short flows

## Concurrency tests

- two `run-next` commands on the same episode
- two different episodes executing simultaneously
- stale lock recovery
- atomic state updates

## Golden tests

Use selected representative episodes to verify canonical paths and expected workflow graphs.

Do not rely only on snapshots for critical behavior.

---

# 23. Security and Safety

Audit for:

- path traversal
- unsafe user-supplied episode identifiers
- shell command construction
- command injection
- unsafe subprocess invocation
- secret leakage in workflow files
- secret leakage in debug logs
- unsafe overwrites
- writing outside the repository or episode root
- symlink attacks where relevant
- malformed manually edited state files

Prefer structured subprocess arguments rather than interpolated shell strings.

CLI commands stored in the state file are informational.

Execution should use structured step definitions rather than executing arbitrary command strings read from manually editable JSON.

This is critical:

```text
Never execute the `cliCommand` string from workflow.json directly.
```

The workflow engine must map a known step ID to a registered executor.

---

# 24. Questions the Audit Must Answer

The final plan must explicitly answer:

1. Why do Codex-driven and CLI-driven executions currently use different paths or filenames?
2. Which implementation should become canonical?
3. Which implementations should be deleted?
4. Which implementations need temporary adapters?
5. Where should path construction live?
6. Where should workflow orchestration live?
7. Where should completion detection live?
8. How should batch and synchronous workflows share code?
9. How should manually edited state be validated?
10. How should stale artifacts be detected?
11. How should the next task be selected?
12. How should partial failures be represented?
13. How should independent tasks continue after unrelated failures?
14. How should existing episodes be migrated?
15. How should old CLI commands be deprecated?
16. How can Codex be instructed to use only the canonical CLI?
17. Which changes can be implemented safely in small batches?
18. Which changes are high-risk?
19. Which commands should be removed, renamed, or merged?
20. What should the final ideal user workflow look like?

---

# 25. Required Deliverables

Create the following Markdown files:

```text
docs/plans/mediaforge-workflow-refactor/
  00-executive-summary.md
  01-current-cli-inventory.md
  02-execution-path-map.md
  03-duplicate-implementation-audit.md
  04-filesystem-and-filename-audit.md
  05-canonical-artifact-layout.md
  06-workflow-state-design.md
  07-workflow-dependency-graph.md
  08-cli-redesign.md
  09-migration-and-compatibility-plan.md
  10-observability-and-error-model.md
  11-testing-strategy.md
  12-security-and-concurrency-review.md
  13-implementation-phases.md
  14-file-by-file-change-plan.md
  15-open-questions-and-decisions.md
```

Also create:

```text
docs/plans/mediaforge-workflow-refactor/task-register.md
```

The task register must contain independently executable implementation tasks.

Each task must include:

- task ID
- objective
- affected files
- dependencies
- proposed changes
- acceptance criteria
- required tests
- migration concerns
- rollback strategy
- risk level
- recommended Codex model
- recommended reasoning effort

---

# 26. Implementation Phases

Organize the recommended implementation into safe phases.

A likely structure is:

## Phase 0: Characterization

- capture current behavior
- add tests around existing paths
- inventory CLI commands
- inventory artifacts
- identify existing duplicate outputs

## Phase 1: Canonical path resolver

- introduce typed path APIs
- route existing writers through the resolver
- keep compatibility readers
- prohibit new manual path concatenation

## Phase 2: Canonical application services

- extract shared story, audio, image, thumbnail, and video services
- route CLI and batch workflows through them
- remove duplicated orchestration logic

## Phase 3: Workflow-state model

- add schema
- add repository
- add atomic writes
- add step registry
- add state transitions
- add workflow status

## Phase 4: Flow-based commands

- workflow status
- workflow next
- workflow plan
- workflow run-next
- workflow resume

## Phase 5: CLI normalization

- introduce canonical commands
- add deprecated aliases
- improve help and error output
- add JSON output

## Phase 6: Episode migration

- inspect legacy layouts
- dry-run migration
- migrate selected episodes
- validate
- migrate remaining episodes

## Phase 7: Cleanup

- remove legacy writers
- remove deprecated paths
- remove duplicate implementations
- remove deprecated commands after the compatibility window

Adjust these phases based on repository findings.

Do not begin with a large rewrite.

---

# 27. File-by-File Change Plan

For every proposed implementation change, list:

- current file
- current responsibility
- identified problem
- target responsibility
- proposed change
- new dependencies
- removed dependencies
- risk
- tests to add
- migration impact

Be concrete.

Avoid vague recommendations such as “refactor the CLI.”

---

# 28. Decision Records

Where significant alternatives exist, write explicit architecture decisions.

At minimum evaluate:

- JSON versus YAML for workflow state
- direct state mutation versus event log
- linear workflow versus DAG
- centralized artifact resolver versus artifact registry
- lock file versus database-backed coordination
- one workflow file per episode versus global workflow database
- keeping npm wrappers versus invoking the CLI binary directly
- aliases versus immediate command removal
- path migration versus compatibility-only reads

For each decision, document:

- context
- options
- recommendation
- rationale
- trade-offs
- consequences

---

# 29. Recommended Direction

Unless repository analysis contradicts it, prefer the following direction:

- One canonical application-service layer
- One typed artifact-path resolver
- One workflow definition registry
- One editable workflow-state file per episode
- One append-only workflow execution log per episode
- Atomic state persistence
- DAG-based dependency calculation
- Deterministic next-step selection
- Structured workflow step IDs
- CLI commands as thin adapters
- Batch and synchronous execution sharing the same executors
- Compatibility readers for legacy paths
- Canonical-path-only writes
- Explicit migration tooling
- No direct execution of command strings from workflow JSON
- Idempotent, resumable step execution
- Machine-readable CLI output
- Strong runtime schema validation
- Incremental implementation with characterization tests first

---

# 30. Suggested Workflow Step IDs

Use stable machine-readable IDs instead of display names.

Examples:

```text
source.validate

story.analyze
story.rewrite.full.en
story.quality.full.en
story.localize.full.de
story.localize.full.es
story.localize.full.fr
story.localize.full.pt

story.rewrite.short.en
story.localize.short.de

audio.generate.full.en
audio.generate.full.de
audio.generate.short.en

scene.plan.full.en
shot.plan.full.en

image.reference.generate
image.generate.full.en
image.generate.short.en

thumbnail.generate.full.en
thumbnail.generate.short.en

video.render.full.en
video.render.short.en

metadata.generate.youtube.full.en
metadata.generate.youtube.short.en

episode.validate
episode.ready_for_publish
```

Derive the actual step catalog from current functionality.

Do not encode execution logic into the string itself.

---

# 31. Example Desired User Experience

The plan should optimize for workflows like:

```bash
npm run mediaforge -- workflow status --episode 025
```

Output:

```text
Episode 025 — The Endless Backrooms
Workflow: default-youtube-episode
Progress: 18/31 completed

Completed:
  ✓ English full rewrite
  ✓ English story quality gate
  ✓ German localization
  ✓ English full audio

Failed:
  ✗ Image 07 full/en
    Recoverable: yes
    Attempts: 2
    Log: debug/workflow/image.generate.full.en-07.log

Ready:
  → Retry image 07
  → Generate Spanish full audio
  → Generate French full audio

Recommended next command:
  npm run mediaforge -- workflow run-next --episode 025
```

Then:

```bash
npm run mediaforge -- workflow run-next --episode 025
```

Output:

```text
Executing: image.generate.full.en.07
Reason: failed recoverable step with all dependencies satisfied

Completed successfully.
Produced:
  images/full/en/scene-007.png

Next:
  npm run mediaforge -- workflow run-next --episode 025
```

---

# 32. Codex Integration Rules

Recommend adding a repository-level Codex instruction stating:

```text
All media-generation operations must use the canonical MediaForge CLI or its application services.

Do not:
- construct episode artifact paths manually
- write generated artifacts directly
- invent filenames
- call provider adapters directly
- bypass workflow-state updates
- duplicate CLI behavior in one-off scripts

Before performing episode work:
1. Run workflow status.
2. Run workflow plan when changing multiple steps.
3. Use workflow run-next or a canonical domain command.
4. Reconcile workflow state after manual artifact edits.
```

Identify the correct repository instruction file to update based on the actual project.

---

# 33. Quality Requirements for the Plan

The plan must be:

- specific to the repository
- based on actual code inspection
- type-safe
- incremental
- backward-compatible during migration
- testable
- operationally safe
- resilient to partial failure
- clear enough for another engineer to implement
- clear enough for Codex to execute task by task

Do not propose replacing the entire application with a third-party workflow engine unless the repository analysis clearly demonstrates that it is necessary.

Do not add a database solely for workflow state unless filesystem-based state is demonstrably insufficient.

Do not preserve duplicate implementations merely to avoid making decisions.

---

# 34. Final Report Requirements

At the end, provide:

## A. Root-cause summary

Explain why path and filename divergence exists.

## B. Canonical architecture

Describe the recommended target architecture.

## C. CLI before-and-after comparison

Show current commands and recommended replacements.

## D. Workflow-state example

Provide a realistic complete example for one episode.

## E. Migration sequence

Show the safest order of implementation.

## F. Top risks

List the highest-risk areas and mitigations.

## G. First implementation batch

Define the smallest useful first implementation task.

The first implementation batch should preferably:

- add characterization tests
- introduce the canonical path resolver
- avoid moving existing artifacts
- avoid changing user-facing behavior
- create the foundation for later workflow-state work

## H. Unresolved decisions

Only include questions that cannot be answered through repository inspection.

Do not ask questions that can be resolved by examining the codebase.

Start by inspecting the repository and creating the requested planning documents.
