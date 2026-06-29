# Audit and Plan Consolidation of Competing Media Implementations

Analyze this repository to identify, compare, and plan the consolidation of competing implementations for:

- audio generation;
- image generation;
- video rendering;
- metadata generation;
- prompt construction;
- retries and resume behavior;
- batch and synchronous processing;
- local and remote execution;
- artifact storage, manifests, and state.

This task is analysis and documentation only.

Do not refactor application code.
Do not change runtime behavior.
Do not remove or deprecate implementations yet.
Do not modify provider integrations.
Do not change CLI behavior.
Do not move generated files.

## Objective

Create a repository-specific inventory and consolidation plan that:

- identifies all active and competing implementations;
- determines which implementations are canonical, alternative, legacy, experimental, or dead;
- documents current callers and behavior;
- defines a target architecture with stable interfaces and provider adapters;
- preserves intentionally different execution modes;
- centralizes orchestration, artifact paths, manifests, retries, and observability;
- produces safe, incremental migration tasks.

The result must be detailed enough for later implementation, but concise enough to remain useful as repository documentation.

## Required output files

Create or update only the following documentation files:

```text
docs/architecture/media-implementation-inventory.md
docs/architecture/target-media-architecture.md
docs/migrations/media-consolidation-plan.md
docs/README.md
AGENTS.md
```

If a required parent directory does not exist, create it.

Do not create additional files unless clearly necessary.

Do not modify source code, tests, runtime configuration, package manifests, or generated artifacts.

## Discovery scope

Inspect the repository to identify all relevant implementations and entry points for:

### Audio

- narration generation;
- text-to-speech providers;
- synchronous and asynchronous generation;
- batch processing;
- localization-specific generation;
- retries and resume flows;
- audio post-processing;
- output naming and storage.

### Images

- synchronous image generation;
- batch image generation;
- prompt generation and sanitization;
- safety-repair flows;
- scene-level retry and resume behavior;
- thumbnail generation;
- localization-specific image or thumbnail handling;
- output naming, state, and manifests.

### Video

- local rendering;
- remote rendering;
- FFmpeg wrappers;
- clip rendering;
- final video composition;
- parallel local and remote execution;
- retries and resume behavior;
- timing and performance recording;
- output naming and storage.

### Metadata

- title, description, tags, hashtags, and chapters;
- full-video and short-form metadata;
- canonical-language and localized metadata;
- separate metadata models;
- retries and validation;
- output files and schemas.

### Cross-cutting behavior

- CLI commands and subcommands;
- orchestration services;
- job state and manifests;
- path resolution;
- artifact naming;
- configuration and environment variables;
- provider clients;
- error normalization;
- logging and metrics;
- idempotency;
- resume semantics;
- batch identifiers and import flows;
- cost and usage tracking.

## Excluded paths

Do not inspect generated or large artifact directories unless a task-specific fact cannot be established otherwise:

```text
node_modules/
dist/
coverage/
.git/
episodes/**/output/
episodes/**/state/
episodes/**/generated-assets/
audio/
video/
images/
transcripts/
logs/
```

Also avoid:

- persisted OpenAI request bodies;
- persisted OpenAI response bodies;
- prompt archives;
- provider trace dumps;
- large debug payloads;
- generated media assets.

Small fixtures, schemas, manifests, and representative test data may be inspected when needed to establish behavior.

Use targeted searches based on:

- interface and class names;
- CLI command names;
- provider names;
- manifest filenames;
- environment-variable prefixes;
- function calls;
- artifact path helpers;
- error types;
- batch IDs;
- resume commands.

Do not read every file in the repository.

## Analysis rules

- Do not assume duplicate-looking implementations are redundant.
- Verify active callers before classifying an implementation.
- Distinguish intentionally different strategies from accidental duplication.
- Prefer actual source code and tests over comments or stale documentation.
- Do not invent historical rationale.
- Mark uncertain conclusions explicitly.
- Do not classify code as dead without confirming there are no callers, exports, CLI references, tests, scripts, or dynamic registrations.
- Do not recommend removal where behavior parity is not established.
- Preserve backward-compatible CLI behavior unless a later migration task explicitly changes it.

## 1. Media implementation inventory

Create:

```text
docs/architecture/media-implementation-inventory.md
```

Document every relevant implementation in a concise table.

For each implementation include:

- capability: audio, image, video, metadata, or cross-cutting;
- implementation name;
- source path;
- primary entry point;
- current callers;
- provider or execution engine;
- execution mode;
- inputs;
- outputs;
- artifact and state paths;
- configuration variables;
- retry behavior;
- resume behavior;
- manifest or persistence behavior;
- tests;
- known strengths;
- known weaknesses;
- overlap with other implementations;
- recommended classification;
- confidence level.

Use these classifications:

- `canonical`
- `supported-adapter`
- `legacy`
- `experimental`
- `dead-candidate`
- `unknown`

Do not classify anything as `dead-candidate` unless no active caller can be found.

Add a summary section that identifies:

- clear duplicates;
- intentional alternatives;
- conflicting path rules;
- conflicting manifest schemas;
- duplicated orchestration logic;
- duplicated retry logic;
- duplicated provider logic;
- conflicting CLI behavior;
- missing tests;
- high-risk migration areas.

## 2. Target media architecture

Create:

```text
docs/architecture/target-media-architecture.md
```

Define a target architecture based on ports and adapters.

The target architecture should separate:

```text
CLI / worker / API
        ↓
application use cases and orchestration
        ↓
capability ports
        ↓
provider and execution adapters
        ↓
OpenAI, FFmpeg, remote renderer, filesystem, queues
```

Define recommended stable interfaces for:

- `AudioGenerator`
- `ImageGenerator`
- `VideoRenderer`
- `MetadataGenerator`
- `EpisodePathResolver`
- `ArtifactStore`
- `ManifestRepository`
- `GenerationJobRepository`
- `ProviderErrorMapper`
- `UsageRecorder`

Use TypeScript examples only where they clarify the contract.

Keep examples short and type-safe.

The architecture must define ownership for:

### Orchestration layer

- stage ordering;
- dependency handling;
- idempotency;
- resume behavior;
- job state;
- manifests;
- artifact registration;
- failure classification;
- progress tracking;
- usage and cost collection.

### Provider adapters

- provider API calls;
- provider-specific request mapping;
- provider-specific response parsing;
- provider-specific limits;
- provider-specific retry hints;
- provider error normalization.

### Path and artifact policy

Define one canonical path policy.

No provider adapter, CLI command, or renderer should independently construct episode paths.

Document how the path resolver should distinguish:

- source files;
- working state;
- generated artifacts;
- shared assets;
- localized assets;
- temporary files;
- manifests;
- final deliverables.

Do not prescribe exact paths unless supported by current repository behavior and project requirements.

### Strategy selection

Represent intentional alternatives as explicit strategies, not separate pipelines.

Examples:

```ts
type ImageExecutionMode = 'synchronous' | 'batch';

type VideoExecutionMode =
  | 'local'
  | 'remote'
  | 'hybrid';

type ResumePolicy =
  | 'never'
  | 'if-partial'
  | 'always';
```

Avoid multiple overlapping boolean feature flags.

### Canonical schemas

Recommend runtime-validated schemas for:

- generation requests;
- generation results;
- artifact references;
- manifests;
- job state;
- provider failures;
- retry decisions;
- usage and cost records.

Use the repository's existing validation library where possible.

### Observability

Define required operational metrics:

- start and completion timestamps;
- duration;
- attempt count;
- provider;
- model;
- execution mode;
- local or remote host;
- batch ID;
- input and output usage;
- estimated cost;
- failure category;
- artifact path;
- resume source.

## 3. Incremental consolidation plan

Create:

```text
docs/migrations/media-consolidation-plan.md
```

The plan must be incremental and safe.

Do not propose a big-bang rewrite.

Use this migration order unless repository evidence justifies another order:

1. metadata generation;
2. audio generation;
3. image generation;
4. video rendering;
5. end-to-end orchestration;
6. legacy removal.

For each phase include:

- objective;
- affected implementations;
- proposed canonical contract;
- compatibility adapter strategy;
- callers to migrate;
- characterization tests required before changes;
- migration steps;
- validation commands;
- observability requirements;
- rollback strategy;
- deprecation conditions;
- removal conditions;
- risks;
- completion criteria.

## Characterization testing requirements

Before refactoring any implementation, require tests that capture current behavior for:

- generated filenames;
- output directories;
- state directories;
- manifest structure;
- CLI arguments;
- environment-variable behavior;
- retry decisions;
- resume semantics;
- ordering guarantees;
- partial failures;
- provider request construction;
- batch ID persistence;
- localized output naming;
- local and remote rendering behavior.

Do not recommend removal until parity is verified.

## Task sizing

Break implementation into independently executable tasks.

Each task should:

- have one primary objective;
- list exact affected files or subsystems;
- define acceptance criteria;
- define targeted validation;
- avoid unrelated refactoring;
- be suitable for a fresh Codex session;
- identify the recommended model:
  - `gpt-5.4-mini` for bounded mechanical changes;
  - `gpt-5.4` for cross-cutting orchestration, path, manifest, or compatibility work.

Do not create implementation code in this task.

## 4. Update documentation index

Update:

```text
docs/README.md
```

Add links to:

- `docs/architecture/media-implementation-inventory.md`
- `docs/architecture/target-media-architecture.md`
- `docs/migrations/media-consolidation-plan.md`

For each link, state when Codex should read it.

Include this rule:

> Read these documents only for tasks involving media generation, episode production, provider adapters, artifact paths, manifests, retries, resume behavior, or media-pipeline refactoring.

Do not instruct Codex to read them for unrelated tasks.

## 5. Update `AGENTS.md`

Update the root-level `AGENTS.md` with a short media-pipeline documentation section.

Keep it under 20 lines.

Suggested structure:

```md
## Media pipeline documentation

For tasks involving audio, image, video, metadata, media orchestration,
artifact paths, manifests, retries, or resume behavior, read only the relevant
documents:

- Implementation inventory: `docs/architecture/media-implementation-inventory.md`
- Target architecture: `docs/architecture/target-media-architecture.md`
- Consolidation plan: `docs/migrations/media-consolidation-plan.md`

Do not load these documents for unrelated tasks.

Source code and tests are authoritative when documentation conflicts with the
implementation. Update only the affected document when a task changes
documented behavior or architecture.
```

Do not copy architecture details into `AGENTS.md`.

## Important constraints

- Do not modify application code.
- Do not add dependencies.
- Do not change package scripts.
- Do not change runtime configuration.
- Do not move files.
- Do not delete implementations.
- Do not rename CLI commands.
- Do not change manifests.
- Do not run generation jobs.
- Do not call external providers.
- Do not render media.
- Do not run root builds or complete test suites.
- Do not produce a full repository audit.
- Do not paste large source excerpts.
- Do not create speculative architecture unsupported by repository evidence.

## Size constraints

Keep documents concise:

- implementation inventory: preferably under 400 lines;
- target architecture: preferably under 300 lines;
- consolidation plan: preferably under 400 lines;
- `AGENTS.md` addition: under 20 lines;
- `docs/README.md` additions: concise.

Use tables and focused source references.

Avoid repeating the same information across documents.

## Validation

After creating the documentation:

1. verify every referenced source path exists;
2. verify every documented caller or entry point;
3. verify CLI command names against the implementation;
4. verify configuration names against schemas and environment handling;
5. verify documented test commands against package scripts;
6. verify Markdown links;
7. verify no source code or runtime configuration changed;
8. verify no implementation was classified as dead without evidence;
9. verify intentional alternatives were not mislabeled as duplicates;
10. verify the migration plan is incremental and reversible;
11. inspect the final diff for duplicate or contradictory documentation.

Do not run the root build, full test suite, media generation, or external provider calls.

## Completion response

Return only:

- files created or changed;
- capabilities inventoried;
- major competing implementations found;
- uncertain findings;
- validation performed;
- blockers.

Do not provide:

- a detailed walkthrough;
- a full repository audit;
- implementation code;
- a changelog;
- a commit message;
- a pull request description.
