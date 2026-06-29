# Codex Prompt — Audit and Update the Story Pipeline Refactoring Task Pack

You are a senior TypeScript architect and delivery planner working inside an existing production repository.

The repository contains an existing task pack for refactoring the story-rewrite pipeline:

```text
./todo-prompts/story-rewrite-refactor-codex-prompts
```

The task pack includes:

```text
README.md
master-specification.md
01-repository-analysis-and-baseline.md
02-story-ir-and-runtime-validation.md
03-source-cleaning-and-provenance.md
04-genre-policies-and-story-contract.md
05-modular-prompt-compiler.md
06-token-budgeting-and-preflight.md
07-canonical-english-generation.md
08-localization-lineage-and-locale-validation.md
09-repair-routing-and-full-regeneration.md
10-incomplete-response-and-retry-hardening.md
11-metadata-audio-shorts-and-visual-separation.md
12-cost-controls-fingerprints-and-telemetry.md
13-persistence-cache-and-resume.md
14-regression-and-integration-tests.md
15-migration-documentation-and-cleanup.md
16-final-cross-cutting-audit.md
```

Your task is to review the repository and this complete task pack, then update the task pack so it accurately covers the repository’s real implementation and fully addresses both full-story and short-story generation.

Do not implement the production refactor in this task.

Do not merely produce recommendations.

Inspect the repository, update the Markdown task files in place, add or split prompts where necessary, update the README execution order and model recommendations, and produce an audit report explaining every material change.

## Primary objective

Ensure the task pack provides a complete, correctly ordered, repository-grounded implementation programme for:

1. canonical English full-story generation;
2. localized full-story generation;
3. English short-story generation;
4. localized short-story generation;
5. validation and repair for both full and short stories;
6. independent metadata, audio, scene, image, rendering, and publishing stages;
7. correct artifact lineage, invalidation, resume, cost accounting, and observability for both full and short variants.

The updated tasks must make full and short story generation explicit first-class pipeline concerns rather than treating shorts as a small downstream detail.

## Required repository analysis

Before editing the task files, inspect the repository and determine the real current behaviour.

Locate all code involved in:

- full-story source discovery;
- canonical English full rewrite;
- English short generation;
- localized full generation;
- localized short generation;
- short extraction or adaptation from full stories;
- any short generation directly from raw sources;
- prompt builders for full and short stories;
- full and short response schemas;
- word-count and duration targets;
- full and short validators;
- full and short repair logic;
- full and short regeneration logic;
- metadata generation for full and short videos;
- audio instructions for full and short videos;
- TTS generation for full and short stories;
- scene planning;
- image prompt generation;
- video rendering;
- thumbnails;
- publishing and upload metadata;
- artifact manifests;
- localization manifests;
- resume logic;
- cache keys;
- stage invalidation;
- cost accounting;
- token budgeting;
- CLI commands and aliases;
- configuration and `.env` values.

Trace the complete call graph for all commands that can produce:

```text
en/full
en/short
es/full
es/short
de/full
de/short
pt/full
pt/short
```

Use the repository’s actual language and locale conventions.

Do not assume the Portuguese variant. Determine whether the repository uses `pt-PT`, `pt-BR`, or another explicit locale.

## Required lineage review

Determine the current and desired artifact lineage.

The preferred lineage should be evaluated against the real repository:

```text
raw English source
  -> cleaned English source
  -> StoryIR
  -> validated canonical English full story
  -> English short adaptation
  -> Spanish full localization
  -> Spanish short adaptation
  -> German full localization
  -> German short adaptation
  -> Portuguese full localization
  -> Portuguese short adaptation
```

The intended short lineage should normally be:

```text
validated locale full story
  -> locale-specific short adaptation
```

Specifically evaluate whether:

- English short should derive from validated canonical English full;
- Spanish short should derive from validated Spanish full;
- German short should derive from validated German full;
- Portuguese short should derive from validated Portuguese full;
- any current short path derives from raw source;
- any current localized short derives from English instead of its localized full story;
- any localized short derives from another localization;
- short generation can run before full-story validation;
- short artifacts correctly record their parent full-story hash.

Document deviations and update the tasks to correct them.

## Full-story requirements that must be explicit

The updated task pack must explicitly cover full-story generation as a separate artifact type.

Full-story tasks must address:

- canonical English rewrite;
- genre-aware narration;
- fiction versus nonfiction boundaries;
- strict narration-only prompts;
- target word ranges;
- duration and WPM targets;
- paragraph structure;
- chronology;
- full-story response schemas;
- full-story token budgets;
- full-story output-token exhaustion;
- full-story deterministic validation;
- full-story semantic validation;
- targeted fragment repair;
- controlled full regeneration;
- localization from validated canonical English;
- locale-specific full-story validation;
- full-story metadata;
- full-story audio instructions;
- full-story TTS;
- full-story scenes and image prompts;
- full-story rendering;
- full-story publication metadata;
- full-story resume and invalidation.

A full story must never be routed through a short-story model, short-story schema, or fragment-repair budget.

## Short-story requirements that must be explicit

The updated task pack must treat short stories as a distinct artifact type with their own contracts, budgets, prompts, validation, repair, metadata, audio, and downstream production.

Short-story tasks must address:

- derivation from the corresponding locale’s final validated full story;
- preservation of the full story’s identity, threat, central rule, climax, and final consequence;
- adaptation rather than arbitrary summarization;
- hook construction;
- immediate conflict;
- compressed escalation;
- one coherent narrative arc;
- clear ending or final sting;
- removal of secondary characters and nonessential subplots;
- target word range;
- target duration;
- target WPM;
- spoken rhythm;
- short-specific paragraph or beat structure;
- short-specific response schema;
- short-specific deterministic validation;
- short-specific semantic validation;
- short-specific repair and regeneration;
- short-specific model routing;
- short-specific token budget;
- short-specific cost ceiling;
- short-specific metadata;
- short-specific audio instructions;
- short-specific scene planning;
- short-specific vertical-video requirements;
- short-specific rendering;
- short-specific YouTube metadata and linkage to the full video;
- independent short-stage resume and invalidation.

Short prompts must not contain:

- full-video audio instructions;
- full-video scene instructions;
- metadata;
- tags;
- hashtags;
- thumbnail direction;
- rendering instructions;
- validation diagnostics;
- repair history.

## Required full-versus-short domain modelling

Review whether the proposed StoryIR and contract adequately separate source truth from artifact-specific output constraints.

Prefer a design where StoryIR stores story truth and separate artifact contracts store presentation requirements.

Evaluate introducing or updating types equivalent to:

```ts
type StoryArtifactVariant = "full" | "short";

type StoryArtifactOwner =
  | "narration"
  | "metadata"
  | "audio"
  | "scene-plan"
  | "image-plan"
  | "render"
  | "publication";

interface StoryArtifactIdentity {
  episodeNumber: string;
  slug: string;
  language: SupportedStoryLanguage;
  locale: SupportedStoryLocale;
  variant: StoryArtifactVariant;
}

interface FullStoryOutputConstraints {
  variant: "full";
  targetWordRange: {
    min: number;
    max: number;
  };
  targetDurationSeconds?: {
    min: number;
    max: number;
  };
  targetWpm?: {
    min: number;
    max: number;
  };
}

interface ShortStoryOutputConstraints {
  variant: "short";
  targetWordRange: {
    min: number;
    max: number;
  };
  targetDurationSeconds?: {
    min: number;
    max: number;
  };
  targetWpm?: {
    min: number;
    max: number;
  };
  hookDeadlineSeconds: number;
  maximumNarrativeBeats: number;
}

type StoryOutputConstraints =
  | FullStoryOutputConstraints
  | ShortStoryOutputConstraints;
```

Do not force these exact types if the repository already has a better domain model.

The updated tasks must ensure variant-specific constraints are represented by discriminated unions and cannot be accidentally mixed.

## Required short adaptation contract

Review and update the tasks to include a compact short-adaptation contract derived from:

- validated locale full narration;
- canonical StoryIR;
- required immutable facts;
- central threat;
- central rule or mechanism;
- critical object;
- climax;
- ending consequence;
- allowed compression;
- forbidden omissions;
- locale;
- target duration and word range.

The short contract must not duplicate the entire StoryIR or inject all full-story analyses.

It must distinguish:

- facts that must remain;
- details that may be compressed;
- details that may be removed;
- dialogue that may be shortened;
- written messages that must remain exact;
- final consequences that must remain;
- invention boundaries.

## Required short-generation flow

Ensure the updated tasks specify a flow equivalent to:

```text
validated locale full narration
  -> deterministic short-source extraction
  -> compact short-adaptation contract
  -> short prompt compilation
  -> token and cost preflight
  -> short narration generation
  -> deterministic short validation
  -> optional semantic short validation
  -> targeted short-fragment repair
  -> controlled short regeneration
  -> final validated short narration
  -> short metadata
  -> short audio instructions
  -> short TTS
  -> short scene planning
  -> short image plan
  -> vertical video rendering
  -> short publication metadata
```

Short metadata, audio, visual planning, rendering, and publication must not be prerequisites for short narration.

## Short generation versus deterministic extraction

Inspect whether the repository currently uses:

- a model-generated short;
- deterministic shortening;
- extractive selection;
- abstractive rewriting;
- a combination.

Update the tasks so Codex evaluates which approach is appropriate.

The task pack should require:

1. deterministic pre-analysis of the validated full story;
2. extraction of mandatory story beats;
3. model-based adaptation only where it improves spoken narrative;
4. deterministic validation after generation;
5. no repeated full-story payload injection where a compact short contract is sufficient.

Do not require a paid model call where deterministic handling can safely resolve formatting or structure.

## Full and short validation matrix

Update the tasks so validation is variant-aware.

### Full-story validation

Include:

- target full word range;
- duration estimate;
- required chronology;
- required entities;
- immutable facts;
- climax;
- ending;
- genre policy;
- narration-only output;
- language and locale consistency;
- no truncation;
- no duplicated major sections;
- no metadata/audio/visual leakage.

### Short-story validation

Include:

- target short word range;
- target duration;
- hook appears within configured opening window;
- immediate story identification;
- one coherent narrative thread;
- central threat or mystery established;
- central rule or mechanism preserved when relevant;
- no unsupported facts;
- no contradiction with parent full story;
- climax or irreversible turn retained;
- final consequence or sting retained;
- no unresolved pronouns caused by compression;
- no orphaned references to removed characters or events;
- no metadata/audio/visual leakage;
- no generic synopsis language;
- no structural commentary;
- correct language and locale;
- no truncation.

Add explicit issue codes for short validation, such as:

```text
SHORT_SOURCE_NOT_VALIDATED_FULL
SHORT_PARENT_HASH_MISMATCH
SHORT_WORD_RANGE_INVALID
SHORT_DURATION_OUT_OF_RANGE
SHORT_HOOK_TOO_LATE
SHORT_MISSING_CENTRAL_THREAT
SHORT_MISSING_CENTRAL_RULE
SHORT_MISSING_CLIMAX
SHORT_MISSING_FINAL_CONSEQUENCE
SHORT_CONTRADICTS_FULL_STORY
SHORT_ORPHANED_REFERENCE
SHORT_READS_AS_SYNOPSIS
FULL_STORY_ROUTED_TO_SHORT_GENERATOR
SHORT_STORY_ROUTED_TO_FULL_REGENERATION
```

Use repository naming conventions where appropriate.

## Repair and regeneration review

Update the repair tasks to explicitly distinguish:

```ts
type StoryGenerationPurpose =
  | "canonical-full"
  | "localized-full"
  | "canonical-short"
  | "localized-short";

type RepairScope =
  | "field"
  | "sentence"
  | "paragraph"
  | "paragraph-range"
  | "opening"
  | "hook"
  | "ending"
  | "full-regeneration"
  | "short-regeneration";
```

Review whether full and short stories need separate regeneration routes.

Ensure:

- a full story never enters short regeneration;
- a short story never enters full-story regeneration with full output targets;
- short fragment repair receives only short-local context;
- global short failures use the configured short model;
- global full localization failures use the localization model;
- token exhaustion remains variant-specific;
- retry caps remain variant-specific;
- request fingerprints include `variant`.

## Configuration review

Inspect current `.env` handling and update tasks so all relevant settings are explicit and separated.

Evaluate settings equivalent to:

```env
MEDIAFORGE_OPENAI_STORY_MODEL=
MEDIAFORGE_OPENAI_STORY_REASONING_EFFORT=
MEDIAFORGE_OPENAI_STORY_MAX_OUTPUT_TOKENS=

MEDIAFORGE_OPENAI_LOCALIZATION_MODEL=
MEDIAFORGE_OPENAI_LOCALIZATION_REASONING_EFFORT=
MEDIAFORGE_OPENAI_LOCALIZATION_MAX_OUTPUT_TOKENS=

MEDIAFORGE_OPENAI_SHORT_MODEL=
MEDIAFORGE_OPENAI_SHORT_REASONING_EFFORT=
MEDIAFORGE_OPENAI_SHORT_MAX_OUTPUT_TOKENS=

MEDIAFORGE_OPENAI_SHORT_LOCALIZATION_MODEL=
MEDIAFORGE_OPENAI_SHORT_LOCALIZATION_REASONING_EFFORT=
MEDIAFORGE_OPENAI_SHORT_LOCALIZATION_MAX_OUTPUT_TOKENS=

MEDIAFORGE_OPENAI_REPAIR_MODEL=
MEDIAFORGE_OPENAI_REPAIR_REASONING_EFFORT=
MEDIAFORGE_OPENAI_REPAIR_MAX_OUTPUT_TOKENS=

MEDIAFORGE_OPENAI_VALIDATOR_MODEL=
MEDIAFORGE_OPENAI_VALIDATOR_REASONING_EFFORT=
MEDIAFORGE_OPENAI_VALIDATOR_MAX_OUTPUT_TOKENS=
```

Do not add redundant settings without evaluating whether one short model can safely support both English and localized short adaptation.

Keep `.env` authoritative.

Update tasks to require configuration precedence tests.

## Budget and cost review

Update tasks so telemetry and cost ceilings distinguish:

```text
en/full
en/short
es/full
es/short
de/full
de/short
pt/full
pt/short
```

At minimum require reporting for:

- full generation cost;
- full localization cost;
- short generation cost;
- localized short generation cost;
- full repair cost;
- short repair cost;
- metadata by variant;
- audio by variant;
- failed calls by variant;
- token exhaustion by variant;
- cost per final full video;
- cost per final short video;
- combined cost per episode and locale.

Request fingerprints must include:

- language;
- locale;
- variant;
- parent artifact hash;
- task;
- model;
- reasoning effort;
- output cap;
- compiler version;
- schema version;
- short-contract version where relevant.

## Persistence and artifact review

Inspect the actual repository layout and update tasks to define logical full and short artifacts.

Prefer an explicit identity equivalent to:

```text
<language>/<variant>/<artifact-owner>
```

For example:

```text
en/full/narration
en/full/metadata
en/full/audio
en/full/scenes
en/short/narration
en/short/metadata
en/short/audio
en/short/scenes
es/full/narration
es/short/narration
```

Do not impose this physical layout if current conventions require a compatibility structure.

Every short artifact must persist:

- language;
- locale;
- variant;
- parent full-story hash;
- StoryIR hash;
- short-contract hash;
- compiler version;
- prompt hash;
- model configuration;
- token usage;
- cost;
- validation;
- repair history;
- status.

## Invalidation review

Update tasks to require dependency-aware invalidation such as:

| Change                  | Required invalidation                                |
| ----------------------- | ---------------------------------------------------- |
| Raw English source      | Canonical full and everything downstream             |
| Cleaner version         | Canonical full and everything downstream             |
| StoryIR                 | All full and short stories                           |
| Canonical English full  | All localized full stories and all short stories     |
| Spanish full            | Spanish short and Spanish downstream assets          |
| German full             | German short and German downstream assets            |
| Portuguese full         | Portuguese short and Portuguese downstream assets    |
| Full prompt module      | Affected full artifacts and dependent shorts         |
| Short prompt module     | Affected short artifacts only                        |
| Short target word range | Affected short narration and downstream short assets |
| Full target word range  | Affected full narration and dependent shorts         |
| Metadata prompt         | Corresponding metadata only                          |
| Audio template          | Corresponding audio only                             |
| Scene planner           | Corresponding scene and visual artifacts only        |
| Renderer                | Rendered media only                                  |

Ensure resume logic never reuses a short whose parent full-story hash has changed.

## CLI review

Inspect current CLI commands and update tasks to cover all commands used for:

- generating full stories;
- generating shorts;
- localizing full stories;
- localizing shorts;
- repairing full stories;
- repairing shorts;
- resuming full generation;
- resuming short generation;
- generating downstream assets.

Preserve existing command names and aliases unless a documented defect requires correction.

Where commands overlap, update the tasks so later implementation consolidates internal orchestration without breaking external commands.

## Task-pack restructuring

Review every numbered task file.

For each file:

1. Determine whether its scope correctly covers full stories.
2. Determine whether its scope correctly covers shorts.
3. Identify missing dependencies.
4. Identify duplicated work.
5. Identify ordering problems.
6. Identify tasks that are too large for one Codex session.
7. Identify tasks that should be merged.
8. Update acceptance criteria.
9. Update required tests.
10. Update the recommended model and execution mode in `README.md`.

You may:

- edit existing prompts;
- split prompts;
- merge prompts;
- rename prompts;
- renumber prompts;
- add new prompts;
- add task dependency metadata;
- add checkpoint prompts;
- update the final audit prompt.

Keep each implementation prompt focused enough for one Codex session.

## Recommended task separation to evaluate

Evaluate whether the pack should have separate prompts for:

1. repository analysis and baseline;
2. StoryIR and artifact-variant modelling;
3. deterministic source cleaning;
4. genre policies and full-story contract;
5. full-story prompt compiler;
6. canonical English full generation;
7. full localization;
8. short adaptation contract and beat extraction;
9. short prompt compiler and generation;
10. full and short validation;
11. full and short repair routing;
12. incomplete responses and retry handling;
13. metadata/audio separation;
14. scene/image/render separation;
15. cost controls and telemetry;
16. persistence/cache/resume;
17. regression tests;
18. migration and cleanup;
19. final audit.

This is guidance, not a required final numbering. Use the repository’s complexity to decide.

## Required README updates

Update `README.md` with:

- revised prompt order;
- dependency graph;
- which prompts are analysis-only;
- which prompts should start in Plan mode;
- when to choose “clear context and implement”;
- recommended model per prompt;
- recommended reasoning effort;
- expected review checkpoints;
- required tests before proceeding;
- commit boundaries;
- instructions for handling newly discovered repository differences;
- explicit warning not to implement all tasks in one thread.

Recommended model policy:

- GPT-5.5 medium for architecture, pipeline lineage, StoryIR, prompt compilers, repair routing, persistence, and final audit;
- GPT-5.4 medium for focused implementation;
- GPT-5.4-mini only for isolated documentation, tests, and small fixes;
- high reasoning only for the final cross-cutting audit or unresolved architecture conflicts.

Use current Codex model names actually available in the environment rather than blindly copying these recommendations.

## Required audit report

Create:

```text
./todo-prompts/story-rewrite-refactor-codex-prompts/TASK-PACK-AUDIT.md
```

Include:

1. repository findings;
2. current full-story call graph;
3. current short-story call graph;
4. current lineage defects;
5. missing full-story concerns;
6. missing short-story concerns;
7. duplicated or conflicting tasks;
8. prompts added;
9. prompts removed;
10. prompts split or merged;
11. changed execution order;
12. changed model recommendations;
13. remaining uncertainties;
14. exact list of updated files.

## Validation of the updated task pack

Before finishing:

- verify every prompt references existing repository concepts or explicitly instructs later Codex sessions to discover them;
- verify full and short stories are first-class variants;
- verify every paid generation stage has preflight, validation, cost, persistence, and resume coverage;
- verify full and short lineage is unambiguous;
- verify localized shorts derive from the matching validated localized full story;
- verify no task sends metadata/audio/visual instructions to narration models;
- verify full stories cannot enter short model routes;
- verify short stories cannot enter full regeneration routes accidentally;
- verify task dependencies are ordered correctly;
- verify acceptance criteria are testable;
- verify the README matches the actual prompt filenames and order.

## Constraints

- Do not implement the production refactor.
- Do not issue paid API requests.
- Do not delete the original `master-specification.md`.
- Preserve important requirements from the master specification.
- Do not rewrite the tasks into vague summaries.
- Keep prompts executable and repository-grounded.
- Do not introduce unsupported models or invented CLI commands.
- Do not change production code except for a strictly necessary read-only analysis helper, and avoid that unless no existing tooling can provide the required information.
- Do not wait for further confirmation.

## Final response

Report:

- task-pack files changed;
- task-pack files added or removed;
- revised number of implementation phases;
- most important full-story additions;
- most important short-story additions;
- model/execution recommendations;
- unresolved repository questions;
- confirmation that no production refactor was implemented.
