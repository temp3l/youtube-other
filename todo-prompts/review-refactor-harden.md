You are a senior TypeScript architecture reviewer and CLI-platform engineer.

Analyze this repository’s episode image-planning, image-prompt generation, image-generation, resume/checkpoint, artifact-storage, and CLI-documentation workflows.

Do not begin by implementing changes.

Your first objective is to understand the current architecture, identify root causes, recommend simplifications, define a canonical storage contract, and write implementation-ready refactoring and hardening tasks.

The repository contains a production pipeline for generating multilingual long-form and short-form YouTube horror episodes. Changes must preserve resumability, deterministic behavior, auditability, type safety, and existing language-specific behavior.

## Known problems to verify

Treat the following as reported symptoms. Locate their actual causes in the code instead of assuming where they originate.

### 1. Incorrect CLI documentation

`cli.md` currently contains an invalid example:

```bash
node apps/cli/dist/index.js episodes resume-images \
  --episode 011-the-black-eyed-children \
  --concurrency 2
```

The command group is reportedly named `episode`, not `episodes`.

Find:

- the actual registered command hierarchy;
- all aliases, examples, README references, help text, tests, shell scripts, package scripts, and documentation that mention either `episode` or `episodes`;
- whether command naming is consistent across the entire CLI;
- whether documentation examples are generated from real command definitions or manually duplicated.

Recommend one canonical naming convention.

Unless compatibility requirements justify otherwise, prefer:

```bash
node apps/cli/dist/index.js episode resume-images \
  --episode 011-the-black-eyed-children \
  --concurrency 2
```

Do not silently retain contradictory command names.

Recommend either:

1. correcting all documentation to use the registered singular command; or
2. adding a documented deprecated alias only if existing automation depends on the plural command.

The final plan must include automated CLI smoke tests that execute documented command examples or otherwise prevent documentation from drifting away from the actual command registry.

### 2. Ambiguous image output location

The command produced generated images under:

```text
episodes/011-the-black-eyed-children/state/
```

Investigate whether that is intentional.

Do not assume that every image belongs in `shared/`.

Determine and document the intended distinction between:

- immutable source inputs;
- shared language-independent episode assets;
- localized assets;
- full-video assets;
- short-video assets;
- resumable execution state;
- prompt/request/response audit records;
- temporary files;
- final generated images;
- final videos and publication artifacts.

Evaluate whether the correct contract should resemble:

```text
episodes/<episode-slug>/
  shared/
    characters/
    references/
    images/
  <language>/
    full/
    short/
  state/
    image-generation/
      manifests/
      prompts/
      responses/
      checkpoints/
      failures/
```

This is only a candidate structure. Reconcile it with the repository’s current conventions before recommending a final layout.

Answer these questions explicitly:

- Are generated scene images language-independent?
- Can full and short variants reuse the same scene image?
- Can localized versions reuse the same image when no visible text is present?
- Are images canonical assets or merely intermediate execution outputs?
- Should `state/` contain final binary images or only metadata and resumability records?
- Which paths are safe to delete and regenerate?
- Which paths are consumed by downstream video composition?
- Which paths are included in manifests?
- How should legacy paths be migrated without breaking resume behavior?
- Is a compatibility resolver required during migration?

Prefer a single typed path-resolution service over path construction scattered across commands and services.

### 3. Poor generated image prompts

Inspect the complete image-prompt pipeline and determine why prompts contain patterns such as:

```text
The event happened...
The event happened.
The event happened...
```

```text
a grounded environment suggested by ...
```

```text
foreground evidence related to ...
```

```text
background context reinforcing ...
```

```text
No recurring characters are required
```

even when the narration explicitly contains Noah or the two children.

Reported prompt defects include:

- duplicated narration;
- truncated sentence fragments;
- double punctuation;
- abstract narration copied directly into visual fields;
- stop-word-stripped keyword soup;
- non-visual concepts treated as visible actions;
- empty `characterIds` for scenes with recurring characters;
- repeated generic boilerplate;
- repeated exclusions;
- contradictory continuity instructions;
- mechanically rotated camera angles;
- mechanically alternating late evening and night;
- fake material differences created only by changing camera angle;
- previous prompt content embedded in the next prompt;
- excessive prompt overlap caused by boilerplate;
- safety ambiguity caused by underspecified scenes;
- large prompts with little useful visual information;
- final image prompts containing internal diagnostic metadata.

Trace every generated field to its source and transformation logic.

Identify whether the defects originate in:

- scene segmentation;
- narration extraction;
- sentence truncation;
- fallback prompt generation;
- keyword extraction;
- stop-word removal;
- prompt templating;
- character-map lookup;
- scene continuity logic;
- previous-scene comparison;
- retry handling;
- schema defaults;
- persistence or hydration;
- model response parsing;
- joining multiple candidate descriptions;
- an upstream story-rewrite stage.

Do not patch individual example strings. Fix the underlying model and pipeline.

## Required architectural direction

Evaluate and improve the following proposed direction. Reject or modify any part that does not fit the repository.

### Separate narration from visual planning

A narration beat is not an image prompt.

Introduce or consolidate a typed intermediate representation similar to:

```ts
export interface SceneVisualPlan {
  readonly sceneId: string;
  readonly narrationBeat: string;
  readonly narrativePurpose:
    | "establishing"
    | "action"
    | "reaction"
    | "evidence"
    | "reveal"
    | "transition"
    | "aftermath";

  readonly renderability:
    | "direct"
    | "requiresInference"
    | "mergeWithPrevious"
    | "mergeWithNext"
    | "skip";

  readonly location: string;
  readonly timeOfDay?: string;
  readonly weather?: string;

  readonly characterIds: readonly string[];
  readonly visibleSubjects: readonly VisualSubject[];
  readonly visibleAction: string;
  readonly focalSubject: string;

  readonly foreground?: string;
  readonly midground?: string;
  readonly background?: string;

  readonly composition: SceneComposition;
  readonly lighting: SceneLighting;
  readonly continuityAnchors: readonly string[];
  readonly distinctiveAnchors: readonly string[];
  readonly exclusions: readonly string[];
}
```

Use the repository’s existing naming and validation conventions rather than copying this interface blindly.

The final provider prompt should be rendered from validated concrete visual fields. It should not be the source of truth for scene comparison, continuity, or resumability.

### Keep three concerns separate

Assess introducing three distinct artifacts:

1. `SceneNarrativeBeat`

   - exact source narration;
   - source offsets or segment IDs;
   - no visual invention.

2. `SceneVisualPlan`

   - concrete, structured, validated visual interpretation;
   - character identities;
   - continuity anchors;
   - renderability decision.

3. `ImageProviderRequest`

   - concise provider-specific prompt;
   - model, size, quality, references, and provider options;
   - no previous-scene diagnostic text.

Internal diagnostics such as `materialDifferencesFromPrevious` must remain outside the prompt sent to the image API.

### Concrete visual-plan validation

Design deterministic validation that rejects or repairs plans containing:

- duplicated sentences;
- repeated fragments;
- double punctuation;
- unfinished clauses;
- placeholder language such as `suggested by`, `related to`, or `reinforcing`;
- keyword lists masquerading as prose;
- abstract visible actions such as “the discovery changed everything”;
- empty focal subjects;
- empty locations;
- unknown character IDs;
- recurring named characters omitted from the character map;
- contradictory exclusions and requested features;
- camera descriptions such as `low-angle angle`;
- previous-scene text copied into provider prompts;
- plans that differ from adjacent scenes only through camera rotation;
- prompts over a configured useful-length threshold.

Validation errors must be typed and actionable.

Avoid one generic boolean such as `isValid`.

Prefer an error model similar to:

```ts
type SceneVisualPlanIssueCode =
  | "DUPLICATED_NARRATION"
  | "TRUNCATED_SENTENCE"
  | "ABSTRACT_VISIBLE_ACTION"
  | "PLACEHOLDER_ENVIRONMENT"
  | "MISSING_FOCAL_SUBJECT"
  | "MISSING_RECURRING_CHARACTER"
  | "UNKNOWN_CHARACTER_ID"
  | "NON_MATERIAL_SCENE_DIFFERENCE"
  | "PROMPT_TOO_VERBOSE"
  | "CONTRADICTORY_CONSTRAINTS";
```

### Meaningful scene-difference checking

Find the implementation producing:

```text
prompt overlaps too much with the previous prompt
```

Determine whether this is a repository validation error, provider error, or wrapper error.

The recorded failure had zero provider attempts, which may indicate preflight rejection. Verify this in code.

Do not calculate material difference from entire final prompt strings.

Ignore common style and exclusion boilerplate.

Compare structured visual semantics with higher weights for:

- visible subjects;
- visible action;
- focal subject;
- location;
- distinctive object or evidence;
- narrative purpose.

Use lower weights for:

- camera angle;
- shot size;
- lighting;
- time of day.

Changing only camera angle, lighting, or time of day must not make an otherwise duplicate scene materially distinct.

Conversely, two prompts sharing the same motel location and style should not be rejected when one shows an empty room and another shows Noah facing two children outside a door.

Recommend a deterministic comparison algorithm. If semantic model calls are currently used, justify their cost and replace them where deterministic structured comparison is sufficient.

### Handle non-visual narration correctly

Many narration beats are abstract transitions, for example:

- a contradiction could no longer be dismissed;
- every decision carried a consequence;
- a discovery changed the meaning of previous events;
- the official account ended;
- the danger ended without explanation.

Do not force every narration segment into a separate image.

Create and document a renderability policy:

- render directly when the narration provides a concrete visible event;
- infer a concrete evidence or reaction shot only when strongly grounded in nearby context;
- merge abstract beats into an adjacent concrete scene;
- reuse a prior image with controlled motion when appropriate;
- skip low-value beats rather than paying for meaningless images.

Scene merging must preserve audio coverage and timestamp mappings.

## Cost and speed objectives

Analyze actual current behavior before proposing optimizations.

The objective is to reduce:

- image API requests;
- prompt-generation model requests;
- prompt tokens;
- failed image requests;
- duplicate images;
- unnecessary high-quality renders;
- regeneration caused by unstable hashes;
- total pipeline duration.

Investigate and recommend improvements in these areas.

### 1. Generate fewer, better images

Determine whether the pipeline currently assumes one image per narration segment.

Recommend a visual-density policy based on:

- target format: full or short;
- narration duration;
- semantic scene changes;
- retention needs;
- whether controlled pan, zoom, crop, parallax, or reuse can cover multiple adjacent beats.

Do not use a fixed “one sentence equals one image” rule.

Introduce a configurable scene budget and minimum useful on-screen duration.

### 2. Two-pass image rendering

Evaluate a workflow such as:

1. low-cost draft generation;
2. validation and optional visual review;
3. selective higher-quality regeneration only for key scenes, failures, thumbnails, or close-up character shots.

Do not regenerate every successful draft merely because another scene failed.

Make quality policy configurable by scene importance and output type.

### 3. Concise provider prompts

Provider prompts should include only information that materially changes the image:

- visual style;
- concrete subjects;
- visible action;
- location;
- composition;
- lighting;
- continuity-critical details;
- compact exclusions.

Remove:

- narration duplication;
- source narration unless needed for auditing;
- previous-scene prose;
- material-difference diagnostics;
- hashes;
- implementation metadata;
- repeated negative instructions;
- generic filler.

Create one normalized shared style prefix or typed style preset rather than repeating large prose blocks throughout internal comparison and hashing logic.

The final provider prompt may still be a complete standalone string, but comparison and caching must understand which parts are static.

### 4. Deterministic planning where possible

Identify which steps genuinely require an LLM.

Prefer deterministic code for:

- sentence normalization;
- deduplication;
- punctuation repair;
- known-character detection;
- character-map lookup;
- path resolution;
- style rendering;
- exclusions;
- hash generation;
- adjacent-scene comparison;
- quality selection;
- request caching;
- resume checks.

Use an LLM only for the genuinely creative task of converting an abstract narrative beat into a concrete visual plan.

Investigate whether multiple scenes can be planned in one structured request while preserving independent validation and retry behavior.

### 5. Cache and idempotency

Review all hashes and cache keys.

Ensure hashes are based on canonical normalized inputs and include only fields that affect output.

Separate:

- narration hash;
- visual-plan hash;
- provider-prompt hash;
- provider-request hash;
- binary-output checksum.

A documentation change, output path change, diagnostic field, status value, or timestamp must not force image regeneration.

A change to model, quality, size, references, concrete visual content, or style preset must invalidate the correct cache layer.

### 6. Concurrency and retry behavior

Audit `--concurrency`.

Determine:

- whether prompt planning and image generation use separate concurrency limits;
- whether provider rate limits are respected;
- whether retries use bounded exponential backoff and jitter;
- whether non-retryable validation failures are distinguished from provider failures;
- whether one failed scene blocks unrelated scenes;
- whether resume mode retries only eligible failures;
- whether partial results are persisted atomically;
- whether concurrent workers can race on manifests or output files.

Recommend safe defaults.

Do not maximize concurrency blindly. Optimize throughput while avoiding rate-limit churn, duplicate requests, memory pressure, and nondeterministic manifest writes.

## Character continuity

Review how character maps and reference images are located and applied.

The supplied records show `characterIds: []` and statements that no recurring characters are needed, including scenes whose narration explicitly names Noah or shows the children.

Find the cause.

Define:

- how named characters are matched;
- how aliases and pronouns resolve;
- how collective identities such as “the children” resolve;
- when reference images are mandatory;
- when a face should intentionally remain hidden;
- how appearance continuity is preserved without forcing every reference image into every request;
- how missing character-map entries fail or degrade gracefully.

Do not invent unnamed substitutes when a known recurring character is present.

## Storage and manifest hardening

Review all filesystem writes involving:

- `episodes/<slug>/state`;
- `episodes/<slug>/shared`;
- localized full and short directories;
- prompts;
- scene JSON;
- manifests;
- generated images;
- reference images;
- temporary files;
- final videos.

Create one canonical typed artifact-layout module.

No command or service should manually concatenate episode paths independently.

Use semantic methods such as:

```ts
artifactPaths.getSharedCharacterReference(...)
artifactPaths.getSceneImage(...)
artifactPaths.getImagePromptRecord(...)
artifactPaths.getImageGenerationCheckpoint(...)
artifactPaths.getLocalizedVideoOutput(...)
```

Names are illustrative.

Require:

- path traversal protection;
- normalized episode slugs;
- atomic writes;
- directory creation in one layer;
- collision prevention;
- stable filenames;
- explicit overwrite policy;
- manifest schema versions;
- backward-compatible migration where necessary;
- clear distinction between recoverable state and canonical assets.

Determine whether final scene images should be stored once in `shared`, separately by language/format, or through a content-addressed asset store referenced by manifests.

Base the decision on actual reuse semantics.

## CLI simplification

Inventory all image-related commands.

Look for overlapping commands such as:

- generate images;
- resume images;
- regenerate images;
- generate missing images;
- retry failed images;
- force image generation;
- plan prompts;
- validate prompts.

Recommend a small, predictable command surface.

Consider whether the public interface should be consolidated around something similar to:

```bash
episode images plan
episode images generate
episode images resume
episode images validate
episode images status
episode images clean
```

Do not adopt this structure without checking compatibility and existing conventions.

For each proposed command, define:

- required arguments;
- optional flags;
- safe defaults;
- dry-run behavior;
- force behavior;
- resume behavior;
- output-path behavior;
- exit codes;
- machine-readable output;
- examples.

The CLI must print the resolved artifact paths before performing writes when verbose or dry-run mode is enabled.

## Observability and failure records

Review logging and persisted failure records.

Every scene attempt should make it possible to determine:

- planning input;
- validated visual plan;
- final provider prompt;
- model and provider options;
- cache decision;
- request attempt count;
- request correlation ID if available;
- duration;
- validation failure;
- provider failure;
- retryability;
- output path;
- output checksum;
- timestamp.

Do not log secrets or authorization headers.

Use structured logs and typed error categories.

Distinguish at minimum:

- source-data error;
- visual-planning error;
- prompt-validation error;
- character-continuity error;
- path-resolution error;
- cache error;
- provider safety rejection;
- provider rate limit;
- provider transient error;
- provider permanent error;
- filesystem error;
- manifest conflict.

## Testing requirements

Plan tests at the correct levels.

### Unit tests

Include tests for:

- narration deduplication;
- punctuation normalization;
- sentence-fragment detection;
- placeholder environment rejection;
- abstract-beat classification;
- character alias resolution;
- visual-plan validation;
- meaningful scene comparison;
- prompt rendering;
- hash stability;
- path resolution;
- path traversal prevention;
- retry classification;
- cache invalidation;
- output-layout policy.

### Fixture and regression tests

Turn representative malformed records from scenes 013–032 into sanitized regression fixtures.

At minimum, cover:

- duplicated narration;
- children omitted from `characterIds`;
- Noah omitted from `characterIds`;
- `low-angle angle`;
- fake environment keyword soup;
- copied previous-scene content;
- abstract transition forced into an image;
- materially different scenes falsely rejected for overlap;
- a genuinely duplicate scene correctly merged or rejected.

Do not put real generated binary images into ordinary unit-test fixtures unless already established in the repository.

### Integration tests

Include:

- documented CLI invocation;
- planning without provider calls;
- dry-run output;
- generation with a mocked image provider;
- resume after one scene fails;
- concurrent generation without manifest corruption;
- migration from a legacy `state/.../images` path;
- downstream video composition resolving the canonical image path.

### Documentation validation

Create a strategy that prevents `cli.md` from documenting nonexistent commands.

Prefer generated command references, executable examples, snapshot tests against command help, or a documentation smoke-test script.

## Required deliverables

Do not implement production changes yet.

Create or update repository-local planning documents using the project’s existing conventions.

At minimum provide:

### 1. Architecture review

Document:

- current pipeline;
- current data flow;
- current artifact flow;
- root causes;
- correctness risks;
- performance and cost risks;
- reliability risks;
- maintainability risks;
- recommended target architecture;
- rejected alternatives and why.

### 2. Canonical artifact-layout decision

Provide a concrete directory tree and explain every directory’s ownership, lifecycle, consumers, and deletion policy.

Explicitly answer whether generated images under `state/` are expected or should move.

### 3. Refactoring plan

Divide work into ordered phases with migration boundaries.

Suggested phases to assess:

1. characterization tests and repository inventory;
2. CLI and documentation correction;
3. centralized artifact-path contract;
4. typed visual-plan schema;
5. prompt generator replacement;
6. character continuity repair;
7. structured scene-difference validation;
8. caching and hashing hardening;
9. resume/concurrency hardening;
10. storage migration;
11. cost and quality policy;
12. cleanup of deprecated code and documentation.

### 4. Implementation tasks

Write small, dependency-aware tasks.

Each task must contain:

- task ID;
- title;
- problem;
- scope;
- implementation notes;
- affected modules or likely search targets;
- acceptance criteria;
- tests;
- dependencies;
- migration concerns;
- rollback considerations;
- risk level.

Separate must-have correctness work from optional optimizations.

Use priorities such as:

- P0: data loss, incorrect resume, broken paths, invalid CLI;
- P1: malformed prompts, continuity defects, false overlap rejection;
- P2: cost and performance improvements;
- P3: optional UX and maintainability improvements.

### 5. Decision log

Record unresolved decisions, including:

- final image ownership and location;
- cross-language image reuse;
- full/short image reuse;
- scene merge rules;
- prompt-planning model usage;
- low-versus-medium-quality policy;
- compatibility period for legacy paths;
- singular command versus plural alias.

For each decision, provide a recommendation and supporting repository evidence.

## Investigation method

Before writing the plan:

1. Inspect the repository structure.
2. Locate the actual CLI command registration.
3. Locate `cli.md` and every related example.
4. Trace `resume-images` from command handler to path resolution and image provider.
5. Trace one malformed scene from narration input to persisted scene JSON.
6. Locate prompt templates and all fallback builders.
7. Locate character-map extraction and lookup.
8. Locate overlap validation.
9. Locate hash computation.
10. Locate state and manifest writers.
11. Locate downstream image consumers.
12. Inspect relevant tests.
13. Inspect recent architectural conventions already used elsewhere in the repository.

Use concrete file paths, symbols, and call chains in the review.

Do not make generic recommendations without tying them to repository evidence.

## Constraints

- Preserve strict TypeScript type safety.
- Avoid `any`, unsafe casts, and stringly typed state.
- Prefer discriminated unions and schema validation at persistence boundaries.
- Preserve auditability.
- Preserve resumability.
- Preserve existing language-specific prompt settings.
- Do not weaken safety handling.
- Do not hide provider errors behind generic messages.
- Do not delete legacy outputs during planning.
- Do not create a new branch.
- Do not implement the refactor yet.
- Do not modify generated images.
- Do not make unrelated repository changes.

## Final response format

Return:

1. executive summary;
2. verified findings with file paths and symbols;
3. answer about `state/` versus `shared/`;
4. target pipeline;
5. target directory structure;
6. CLI recommendation;
7. prompt-generation recommendation;
8. cost and performance recommendations;
9. ordered migration plan;
10. prioritized task table;
11. test strategy;
12. risks and open decisions;
13. list of planning files created or modified.

Be explicit where repository evidence contradicts the reported assumptions.
