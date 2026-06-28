You are a senior TypeScript CLI architect, media-pipeline engineer, and codebase refactoring specialist.

Analyze the existing codebase for the **Dark Truth Episodes** YouTube production application.

Your objective is to design a coherent, reliable, and intuitive command-line interface for running every stage required to produce and publish:

- full-length YouTube horror videos;
- YouTube Shorts;
- localized variants;
- English optimized variants.

This task is for **analysis, architecture, planning, and task creation only**.

Do not implement the refactor yet.

---

# Primary goals

1. Inspect the existing codebase and document how the current story and video production workflows operate.
2. Identify all existing CLI commands, services, prompt builders, generators, file paths, manifests, metadata files, and shared utilities involved in episode production.
3. Determine the correct dependency order for every pipeline stage.
4. Identify missing, duplicated, incorrectly ordered, or inconsistently implemented stages.
5. Design a consistent and intuitive CLI command hierarchy.
6. Design a resumable, observable, and idempotent orchestration workflow.
7. Recommend the required architectural refactorings.
8. Create a detailed implementation plan.
9. Create actionable development tasks with dependencies and acceptance criteria.
10. Produce CLI documentation examples for the proposed interface.

Do not make assumptions about the current implementation without inspecting it first.

---

# Current expected production stages

The application currently or conceptually includes stages such as:

1. Rewrite and optimize the English full story.
2. Rewrite the optimized English story into a YouTube Short.
3. Extract a shared character map.
4. Generate character reference images.
5. Generate localized full stories.
6. Generate localized short stories.
7. Generate narration audio.
8. Generate subtitles or timestamped transcripts.
9. Create scene plans.
10. Generate scene image prompts.
11. Generate scene images.
12. Validate generated media assets.
13. Render video clips.
14. Assemble final videos.
15. Generate thumbnails.
16. Generate YouTube metadata.
17. Perform quality validation.
18. Upload or schedule videos on YouTube.
19. Persist execution reports, costs, durations, request logs, and output manifests.

Validate this list against the actual codebase.

Do not blindly preserve this order. Determine the correct dependency graph from the implementation and production requirements.

---

# Canonical content rules

The workflow must follow these content-source rules:

- The user always begins with an English full-length source story.
- The English source story must first be rewritten and optimized.
- If optimized English full-story generation fails, all dependent processing must abort.
- The optimized English full story becomes the canonical source for downstream generation.
- All localized full stories must be generated from the optimized English full story.
- All short stories, including the English short story, should be generated from the optimized English full story.
- Localized short stories should not be generated from an unoptimized source story.
- Determine whether localized shorts should be generated directly from the optimized English full story or from the corresponding localized full story. Recommend the approach that best preserves factual consistency, localization quality, cost efficiency, and maintainability.
- A shared character map must be generated from the optimized English full story.
- The character map must exist only in the episode’s shared directory.
- Do not create separate character maps for every language or format unless the codebase contains a justified exception.
- Existing character maps must be reused unless regeneration is explicitly requested.
- Character reference images must be generated from the shared character map.
- Character reference images should be shared across languages unless a genuine localization requirement makes this inappropriate.
- Existing language-specific prompt-builder settings must remain supported.
- Do not flatten, remove, or bypass the current language-specific prompt configuration.
- Inspect how English, German, Spanish, French, and Portuguese settings are currently injected and preserve the capability in the proposed design.

---

# Recommended pipeline model to evaluate

Analyze whether the following phased model is appropriate.

## Phase 1: Episode initialization

- Resolve source story.
- Resolve episode number and slug.
- Create or validate the episode directory.
- Normalize and validate episode configuration.
- Create an initial episode manifest.
- Detect existing assets.
- Validate requested languages, formats, providers, and output targets.

## Phase 2: Canonical story preparation

- Import the original English source story.
- Rewrite and optimize the English full story.
- Validate the optimized story.
- Extract canonical facts, entities, supernatural rules, locations, chronology, and continuity constraints.
- Extract the shared character map.
- Generate or validate shared character reference images.

Evaluate whether canonical facts and character extraction should be one operation or separate operations.

## Phase 3: Story variants

- Generate the English short story.
- Generate localized full stories.
- Generate localized short stories.
- Validate target word counts and estimated narration durations.
- Validate preservation of facts, characters, rules, and core story beats.
- Record lineage showing which artifact was used to generate each variant.

## Phase 4: Pre-production

For every requested language and format:

- Generate narration-production instructions.
- Generate narration audio.
- Generate timestamped transcript or forced alignment.
- Generate subtitle files.
- Generate scene plan.
- Generate scene image prompts.
- Generate thumbnail concepts and thumbnail prompts.
- Estimate duration and required scene count.

Evaluate which operations can run concurrently and which depend on audio timing.

## Phase 5: Visual asset generation

- Generate scene images.
- Reuse relevant character reference images.
- Validate dimensions, file formats, naming, completeness, and corruption.
- Generate missing assets only.
- Produce vertical adaptations for Shorts where necessary.
- Generate thumbnails as separate images.
- Never combine multiple thumbnails into a collage or contact sheet.

## Phase 6: Video production

- Render individual clips.
- Record per-clip render duration.
- Support local and remote rendering where currently implemented.
- Assemble clips with narration, subtitles, music, and sound effects.
- Normalize audio.
- Validate final dimensions, codecs, duration, synchronization, and file integrity.
- Produce final full-length and Short video files.

## Phase 7: Publishing preparation

- Generate titles, descriptions, tags, hashtags, chapters, and upload metadata.
- Generate localized metadata independently for each language and format.
- Validate title and description limits.
- Validate that metadata matches the actual story and final video.
- Run a final pre-upload quality gate.

## Phase 8: Publishing

- Upload the final video.
- Upload the correct thumbnail.
- Configure visibility, playlist, language, audience settings, and scheduling.
- Persist the YouTube video ID and upload response.
- Prevent accidental duplicate uploads.
- Support dry-run and explicit confirmation or a deliberate non-interactive upload flag.

## Phase 9: Reporting

- Finalize the episode manifest.
- Persist execution history.
- Persist prompt requests and responses.
- Persist API usage and estimated costs where available.
- Persist stage durations and rendering durations.
- Record warnings, failures, retries, generated artifacts, reused artifacts, and skipped stages.
- Produce a readable final workflow report.

Identify any missing phases or steps and explain why they should be added.

---

# Required codebase analysis

Inspect at least the following areas where present:

- CLI bootstrap and command registration;
- existing `stories` commands;
- rewrite-full and rewrite-short commands;
- episode-generation commands;
- localization commands;
- character-map extraction;
- image-generation commands;
- character-reference generation;
- narration or TTS generation;
- transcription and subtitle generation;
- scene planning;
- scene image generation;
- clip rendering;
- local and remote FFmpeg execution;
- final video assembly;
- metadata generation;
- thumbnail generation;
- YouTube upload integration;
- prompt builders;
- language-specific prompt settings;
- OpenAI client wrappers;
- retry and timeout handling;
- concurrency controls;
- filesystem layout;
- episode manifests;
- `scenes.json` placement;
- generated asset directories;
- shared directories;
- localization directories;
- command naming and argument conventions;
- logs and execution reports;
- request and response persistence;
- current tests and fixtures.

Search for dead, duplicated, or partially overlapping workflows.

Identify commands that bypass shared services or apply different path rules.

---

# Dependency graph

Produce an explicit dependency graph for the proposed pipeline.

For every stage, document:

- required inputs;
- generated outputs;
- dependencies;
- whether it is canonical, shared, language-specific, format-specific, or publication-specific;
- whether it can run in parallel;
- whether it is safe to retry;
- whether it is safe to skip when outputs already exist;
- how its completion should be validated;
- what downstream artifacts become invalid if it is regenerated.

Pay special attention to invalidation rules.

Examples:

- Rewriting the optimized English story may invalidate facts, character maps, localizations, audio, scenes, images, videos, and metadata.
- Regenerating only metadata should not invalidate videos.
- Regenerating audio may invalidate timestamps, subtitles, scenes, clips, and final video.
- Regenerating one scene image should invalidate only dependent clips and final assembly, not the entire episode.

Recommend a practical artifact fingerprint or content-hash strategy.

---

# CLI design requirements

Design a simple, consistent CLI around a top-level `episodes` namespace.

Prefer nouns for resource groups and verbs for operations.

Evaluate and refine a structure similar to:

```bash
youtube episodes init
youtube episodes inspect
youtube episodes status
youtube episodes validate
youtube episodes run
youtube episodes resume
youtube episodes clean

youtube episodes stories optimize
youtube episodes stories localize
youtube episodes stories create-short
youtube episodes stories validate

youtube episodes characters extract
youtube episodes characters generate-references

youtube episodes audio generate
youtube episodes audio align
youtube episodes subtitles generate

youtube episodes scenes plan
youtube episodes scenes generate-prompts
youtube episodes scenes generate-images
youtube episodes scenes validate

youtube episodes thumbnails generate

youtube episodes video render-clips
youtube episodes video assemble
youtube episodes video validate

youtube episodes metadata generate
youtube episodes metadata validate

youtube episodes publish upload
youtube episodes publish schedule
```

The final design may differ when justified by the codebase.

The CLI should support both:

1. granular commands for individual stages;
2. orchestration commands that run the complete dependency-aware pipeline.

Example desired workflows:

```bash
youtube episodes run \
  --episode 011-the-children-asked-to-come-inside \
  --languages en,de,es,fr,pt \
  --formats full,short
```

```bash
youtube episodes run \
  --source ./stories/the-black-eyed-children.md \
  --episode 011-the-children-asked-to-come-inside \
  --languages en,de \
  --formats full,short \
  --until video
```

```bash
youtube episodes resume \
  --episode 011-the-children-asked-to-come-inside
```

```bash
youtube episodes status \
  --episode 011-the-children-asked-to-come-inside
```

```bash
youtube episodes metadata generate \
  --episode 011-the-children-asked-to-come-inside \
  --language de \
  --format full \
  --force
```

Recommend the best naming and grouping after examining existing conventions.

---

# Global CLI options

Design a normalized option system.

Consider:

```text
--episode <slug-or-path>
--source <file>
--language <code>
--languages <codes>
--format <full|short>
--formats <formats>
--from <stage>
--until <stage>
--only <stage>
--skip <stages>
--force
--resume
--dry-run
--concurrency <number>
--provider <provider>
--local
--remote
--json
--verbose
--quiet
--yes
```

Do not add options that overlap or create ambiguous behavior.

Define precedence and incompatibility rules.

For example:

- `--only` should conflict with `--from` and `--until`.
- `--force` should regenerate selected outputs and invalidate dependants according to policy.
- `--resume` should continue failed or incomplete stages.
- `--dry-run` should show the execution plan without writing files or calling external APIs.
- `--json` should produce machine-readable output and avoid decorative console formatting.
- upload commands should require an explicit confirmation or `--yes`.

Recommend whether singular and plural language/format options should both exist.

Prefer one consistent convention.

---

# Orchestration requirements

Recommend a dependency-aware orchestrator instead of a large procedural command.

The design should include concepts such as:

```ts
type PipelineStageId =
  | "episode.initialize"
  | "story.optimize"
  | "facts.extract"
  | "characters.extract"
  | "characters.references.generate"
  | "story.full.localize"
  | "story.short.generate"
  | "audio.generate"
  | "audio.align"
  | "subtitles.generate"
  | "scenes.plan"
  | "scenes.prompts.generate"
  | "scenes.images.generate"
  | "thumbnail.generate"
  | "video.clips.render"
  | "video.assemble"
  | "video.validate"
  | "metadata.generate"
  | "metadata.validate"
  | "publish.upload";
```

This is illustrative. Refine the stage taxonomy during analysis.

Each stage should ideally expose a contract comparable to:

```ts
interface PipelineStage<TContext, TResult> {
  readonly id: PipelineStageId;
  readonly dependencies: readonly PipelineStageId[];

  isApplicable(context: TContext): Promise<boolean>;
  inspect(context: TContext): Promise<StageInspection>;
  execute(context: TContext): Promise<TResult>;
  validate(context: TContext, result: TResult): Promise<StageValidation>;
}
```

Recommend the correct types and abstractions based on the codebase.

Avoid overengineering. The architecture must remain understandable and testable.

---

# Idempotency and resumability

The proposed workflow must:

- safely detect completed stages;
- reuse valid artifacts;
- regenerate missing or invalid artifacts;
- distinguish skipped, reused, completed, failed, and blocked stages;
- resume after process interruption;
- preserve previous failure diagnostics;
- avoid duplicate external API requests;
- avoid duplicate uploads;
- support force-regeneration at stage, language, and format scope;
- understand downstream invalidation.

Recommend how stage state should be persisted.

Do not use the existence of a file alone as proof of successful completion.

Completion should consider:

- manifest state;
- input fingerprints;
- output fingerprints;
- schema validation;
- file integrity;
- provider/model settings;
- prompt version;
- generator version;
- dependency versions.

---

# Manifest design

Review the existing manifest implementation before proposing replacement.

Recommend whether the application needs:

1. one episode-level manifest;
2. per-language manifests;
3. per-format manifests;
4. per-run execution reports.

Prefer a clear source-of-truth model over multiple conflicting manifests.

A possible manifest structure could include:

```ts
interface EpisodeManifest {
  schemaVersion: number;
  episode: {
    number?: number;
    slug: string;
    title?: string;
  };
  canonicalSource: ArtifactReference;
  requestedLanguages: readonly LanguageCode[];
  requestedFormats: readonly StoryFormat[];
  sharedArtifacts: SharedArtifactManifest;
  variants: Record<string, VariantManifest>;
  stages: Record<PipelineStageId, StageState>;
  publications: PublicationRecord[];
  createdAt: string;
  updatedAt: string;
}
```

Refine this based on actual requirements.

The manifest must not become a dumping ground for large prompt responses or transcript content. Store large data in separate files and reference them.

---

# Suggested filesystem principles

Inspect the current structure and propose a migration only when necessary.

The structure should clearly separate:

- immutable or canonical inputs;
- shared derived artifacts;
- language-specific artifacts;
- format-specific artifacts;
- generated media;
- final outputs;
- pipeline state;
- logs and execution records.

Evaluate a structure similar to:

```text
episodes/
  011-the-children-asked-to-come-inside/
    manifest.json

    source/
      original-en-full.md
      optimized-en-full.md

    shared/
      facts.json
      character-map.json
      characters/
        references/
      prompts/
      reports/

    variants/
      en/
        full/
          story.md
          audio/
          subtitles/
          scenes/
          images/
          thumbnails/
          video/
          metadata/
        short/
          story.md
          audio/
          subtitles/
          scenes/
          images/
          thumbnails/
          video/
          metadata/

      de/
        full/
        short/

    runs/
      <run-id>/
        execution.json
        logs/
        requests/
        responses/
```

Do not enforce this exact structure without comparing it with the current codebase.

Provide a migration strategy for existing episodes and preserve backward compatibility where practical.

Explicitly determine the correct location for:

- `scenes.json`;
- episode manifests;
- variant manifests, if used;
- character maps;
- character reference images;
- prompt requests and responses;
- audio files;
- subtitle files;
- rendered clips;
- final videos;
- localized metadata;
- thumbnails;
- upload response records.

---

# Error handling

Design a typed error model that distinguishes:

- invalid CLI usage;
- invalid episode configuration;
- missing dependency;
- invalid source content;
- provider/API failure;
- retryable failure;
- rate limiting;
- timeout;
- generated-content validation failure;
- filesystem failure;
- rendering failure;
- upload failure;
- manual intervention required.

Recommend consistent exit codes.

The orchestrator should stop dependent stages after a failure while allowing independent branches to continue when safe.

For example, a failed Portuguese full-story localization should not necessarily prevent English and German video generation.

The final summary must clearly show partial success.

---

# Concurrency

Identify stages that can safely execute concurrently.

Likely candidates include:

- independent localizations;
- full and short variant generation after canonical preparation;
- per-language audio generation;
- scene image generation with bounded concurrency;
- clip rendering;
- metadata generation;
- independent variant validation.

Do not parallelize stages with unresolved dependencies.

Recommend:

- global concurrency limits;
- provider-specific concurrency limits;
- render-worker limits;
- remote-render limits;
- rate-limit handling;
- backpressure;
- cancellation behavior.

Preserve any existing local/remote rendering toggle and evaluate how it fits into the unified CLI.

---

# Validation and quality gates

Recommend explicit validators for each artifact class.

## Story validation

- expected language;
- expected format;
- word-count boundaries;
- narration-duration estimate;
- required headings;
- no leaked prompt instructions;
- character consistency;
- factual consistency;
- preserved supernatural rule;
- continuity validation.

## Audio validation

- file exists and is readable;
- expected codec;
- non-zero duration;
- duration within a reasonable range;
- no silent or truncated output;
- language and voice settings recorded.

## Scene validation

- valid schema;
- timestamps ordered and non-overlapping;
- coverage of full narration duration;
- referenced image files exist;
- prompt and character references are resolvable.

## Image validation

- readable file;
- expected dimensions and orientation;
- expected format;
- no duplicate placeholder files;
- association with the correct scene.

## Video validation

- readable by FFprobe;
- expected codec and dimensions;
- audio and video streams exist;
- correct duration;
- acceptable audio/video drift;
- no missing clips;
- correct full or short aspect ratio.

## Metadata validation

- correct language and format;
- valid title length;
- valid description length;
- valid tags;
- chapters correspond to final duration;
- no placeholder values;
- no metadata copied from the wrong variant.

## Upload validation

- final video validated;
- thumbnail exists;
- metadata validated;
- upload has not already completed;
- account/channel target is explicit;
- privacy and scheduling options are explicit.

---

# Logging and observability

Review the existing logging architecture.

Recommend structured logs containing:

- run ID;
- episode slug;
- stage ID;
- language;
- format;
- provider;
- model;
- attempt;
- duration;
- artifact paths;
- result status;
- error code.

Sensitive values, authentication tokens, and full secrets must never be logged.

Prompt request and response persistence must redact secrets and provider headers.

Recommend human-readable console output plus optional JSON output.

Example status display:

```text
Episode: 011-the-children-asked-to-come-inside
Run: 2026-06-27T18-42-10Z

✓ story.optimize
✓ characters.extract
↺ characters.references.generate     reused
✓ story.full.localize[de]
✗ story.full.localize[pt]             validation_failed
✓ audio.generate[en,full]
… scenes.images.generate[de,short]    14/22
○ publish.upload[en,full]              blocked
```

---

# Security and publishing safeguards

Review all external process execution and upload integrations.

Ensure the design addresses:

- command injection when calling FFmpeg, SSH, rsync, or shell commands;
- safe argument arrays instead of shell string concatenation;
- path traversal prevention;
- safe episode slug validation;
- secret redaction;
- provider token handling;
- YouTube credential handling;
- accidental upload prevention;
- duplicate upload prevention;
- explicit channel selection;
- upload retry semantics;
- remote rendering host validation.

Do not expose secrets in manifests, generated logs, execution reports, or persisted requests.

---

# Testing strategy

Create a testing plan covering:

## Unit tests

- CLI option parsing;
- command validation;
- dependency graph construction;
- stage applicability;
- artifact path resolution;
- manifest transitions;
- fingerprint calculation;
- invalidation rules;
- status rendering;
- error classification.

## Integration tests

- pipeline execution with mocked providers;
- resuming a partially completed episode;
- reusing existing artifacts;
- forcing a single stage;
- localized full and short generation;
- partial branch failure;
- render command construction;
- upload dry-run;
- duplicate upload prevention.

## Filesystem fixture tests

Create representative episode fixtures containing:

- new episode;
- completed episode;
- partially completed episode;
- stale artifact fingerprints;
- missing scene image;
- corrupted audio;
- failed localization;
- uploaded variant.

## End-to-end smoke tests

Use lightweight or mocked providers where practical.

No normal CI test should make paid API calls or upload real videos.

---

# Documentation requirements

Design documentation that includes:

1. pipeline overview;
2. canonical source rules;
3. directory structure;
4. stage dependency diagram;
5. command reference;
6. common workflows;
7. resume and force behavior;
8. language and format selection;
9. local and remote rendering;
10. dry-run behavior;
11. troubleshooting;
12. upload safeguards;
13. exit codes;
14. migration guide from legacy commands.

Provide example commands for:

- creating a new episode from a Markdown source;
- running the complete pipeline;
- generating only full-length variants;
- generating only Shorts;
- generating one language;
- generating all configured languages;
- stopping after story generation;
- starting at image generation;
- regenerating one failed scene;
- regenerating audio and its dependants;
- checking episode status;
- validating without regeneration;
- resuming an interrupted run;
- running without upload;
- uploading one completed variant;
- printing JSON status for automation.

---

# Backward compatibility

Identify all current commands that should:

- remain unchanged;
- become aliases;
- be deprecated;
- be removed;
- be replaced.

Provide a staged migration strategy.

Where practical, legacy commands should delegate to the new stage services rather than maintaining separate implementations.

Example:

```bash
stories rewrite-full
```

may temporarily delegate to:

```bash
youtube episodes stories optimize
```

Do not silently change output locations without migration support and clear documentation.

Recommend deprecation warnings and a removal timeline, but do not invent release dates.

---

# Required deliverables

Produce the following documents in a suitable planning or documentation directory already used by the repository. If no suitable directory exists, recommend one.

## 1. Current-state analysis

Suggested filename:

```text
docs/plans/youtube-pipeline-current-state.md
```

Include:

- current commands;
- current workflow;
- current directory layout;
- duplicated logic;
- inconsistent naming;
- broken abstractions;
- path-placement problems;
- hidden dependencies;
- missing validation;
- resumability weaknesses;
- publishing risks.

Every major finding must reference concrete files, symbols, or commands.

## 2. Proposed architecture

Suggested filename:

```text
docs/plans/youtube-pipeline-proposed-architecture.md
```

Include:

- stage model;
- dependency graph;
- orchestration model;
- manifest model;
- artifact model;
- invalidation model;
- concurrency model;
- error model;
- observability model;
- security considerations.

## 3. CLI specification

Suggested filename:

```text
docs/plans/youtube-pipeline-cli-specification.md
```

Include:

- final recommended command tree;
- command descriptions;
- shared options;
- command-specific options;
- option conflicts;
- examples;
- exit codes;
- legacy command mapping.

## 4. Filesystem and migration plan

Suggested filename:

```text
docs/plans/youtube-pipeline-filesystem-migration.md
```

Include:

- existing layout;
- proposed layout;
- artifact ownership;
- migration phases;
- compatibility strategy;
- handling of existing episodes;
- rollback considerations.

## 5. Implementation plan

Suggested filename:

```text
docs/plans/youtube-pipeline-implementation-plan.md
```

Divide implementation into safe phases.

For each phase provide:

- objective;
- affected modules;
- new modules;
- refactorings;
- migration work;
- tests;
- completion criteria;
- risks;
- dependencies.

## 6. Actionable task list

Use the repository’s existing task format if one exists.

Otherwise create:

```text
docs/plans/youtube-pipeline-tasks.md
```

Every task must contain:

```text
Task ID:
Title:
Objective:
Dependencies:
Affected files/modules:
Implementation outline:
Acceptance criteria:
Required tests:
Migration considerations:
Risks:
Estimated complexity: S | M | L | XL
```

Tasks should be small enough to implement and review independently.

Establish explicit dependencies between tasks.

---

# Recommended planning phases

Refine these after inspection.

## Phase A: Discovery and safety net

- inventory commands and services;
- document current artifact paths;
- identify all legacy entry points;
- add characterization tests;
- establish fixtures.

## Phase B: Shared domain model

- typed language and format identifiers;
- typed episode identity;
- artifact identifiers;
- stage identifiers;
- path resolver;
- manifest schemas;
- typed errors.

## Phase C: Stage extraction

- extract existing operations into reusable stage services;
- keep legacy commands operational;
- remove direct filesystem logic from command handlers;
- unify provider invocation.

## Phase D: Orchestrator

- dependency graph;
- planning;
- dry run;
- execution;
- retries;
- resume;
- state persistence;
- invalidation.

## Phase E: CLI redesign

- command hierarchy;
- shared options;
- consistent output;
- status and inspection commands;
- compatibility aliases.

## Phase F: Validation and reporting

- artifact validators;
- final quality gates;
- execution reports;
- structured logging;
- timing and cost records.

## Phase G: Publishing safeguards

- upload preflight;
- duplicate detection;
- confirmation controls;
- upload records;
- scheduling.

## Phase H: Migration and cleanup

- migrate existing episodes;
- deprecate old commands;
- remove duplicated logic;
- finalize documentation.

---

# Analysis standards

- Base all conclusions on inspected code.
- Reference exact file paths and symbols.
- Clearly distinguish confirmed findings from recommendations.
- Identify high-risk refactorings.
- Prefer incremental migration over a large rewrite.
- Preserve working functionality.
- Do not introduce abstractions that are not justified by repeated behavior.
- Maintain strict TypeScript type safety.
- Avoid `any`, unchecked casts, and loosely typed manifest data.
- Validate persisted JSON at runtime.
- Prefer immutable types where practical.
- Keep command handlers thin.
- Separate domain logic, orchestration, filesystem access, providers, and presentation.
- Ensure all recommendations are suitable for a production automation pipeline.
- Do not implement production changes during this task.

---

# Final console response

After creating the planning documents, print a concise summary containing:

1. the most important current architectural problems;
2. the final recommended pipeline order;
3. the recommended top-level CLI structure;
4. the proposed implementation phases;
5. the first five tasks that should be implemented;
6. the highest-risk migration concern;
7. all documents created or modified.

Do not claim that implementation has been completed.

Do not modify production code.

Do not create a branch unless explicitly required by the repository’s contribution instructions.

Begin by inspecting the repository structure, package scripts, CLI registration, existing commands, and episode artifact layout.
