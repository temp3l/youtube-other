You are a senior TypeScript architect and AI media-pipeline engineer.

Analyze the existing repository and harden the image-production pipeline so it can process many different stories reliably, preserve the intended visual meaning of each scene, reduce avoidable image-safety rejections, prevent local prompt-validation loops, and keep image generation efficient.

Do not create a separate branch. Work directly in the current working tree.

Do not redesign unrelated parts of the application.

Start by inspecting the repository, locating the complete image-generation flow, and documenting how scene data is transformed into the final provider request.

Pay particular attention to:

- scene JSON schemas and TypeScript types;
- prompt builders;
- character-map and continuity handling;
- image provider adapters;
- local prompt validators;
- retry logic;
- safety rejection handling;
- output paths;
- persisted request and response artifacts;
- CLI commands for generating and resuming images;
- concurrency, timeout, and cost-related configuration;
- tests and documentation.

The pipeline currently processes scene objects similar to this:

- `canonicalNarration`
- `subject`
- `action`
- `setting`
- `composition`
- `cameraFraming`
- `mood`
- `continuityReferences`
- `textRequirement`
- `onScreenText`
- `negativeConstraints`
- `aspectRatios`
- `imagePrompt`
- expected output filenames
- timing and scene metadata

The existing scene schema must remain compatible unless a clearly optional, backward-compatible extension is necessary.

Do not mutate narration, timing, IDs, source segment IDs, expected filenames, continuity references, or unrelated scene data merely to avoid image-generation failures.

The intended architecture is:

1. Scene narration remains the canonical story description.
2. Scene visual fields describe the intended image.
3. A dedicated visual-prompt processing layer converts the scene into a production-ready provider prompt.
4. The image provider receives only the processed visual prompt and required generation parameters.
5. Safety fallbacks change the visual representation, not the story itself.

## Primary requirements

Implement a reusable visual prompt processing and safety-abstraction layer that works across many stories and genres.

The pipeline must not simply append `canonicalNarration` to `imagePrompt`.

Narration may be used as contextual input during analysis, but it must not automatically be copied into the final image-provider prompt.

The final provider prompt must be built primarily from the scene’s visual fields:

- `imagePrompt`
- `subject`
- `action`
- `setting`
- `composition`
- `cameraFraming`
- `mood`
- `negativeConstraints`
- `textRequirement`
- `onScreenText`
- continuity information where relevant
- character references where relevant

Inspect the existing implementation before deciding which fields are authoritative. Avoid duplicating contradictory descriptions.

## Preserve visual intent

The system must attempt to preserve, in order:

1. setting;
2. important props;
3. narrative evidence;
4. composition;
5. camera framing;
6. lighting and mood;
7. implied supernatural or threatening event;
8. human silhouette or obscured presence;
9. identifiable person;
10. explicit disturbing feature.

When a scene is risky, abstract details from the bottom of this hierarchy upward rather than replacing the entire scene with a generic image.

For example:

- preserve a motel room, door, telephone, rain, and shadows;
- abstract identifiable children into silhouettes, shadows, reflections, or evidence;
- preserve an investigation through files, dates, folders, and unreadable clippings;
- abstract explicit victims or bodies;
- preserve a bedroom reveal through an empty bed, nightstand, wet marks, or disturbed objects;
- preserve a supernatural face reveal through shadow, reflection, obscured facial detail, or an off-screen reaction.

Do not over-sanitize every horror scene. Apply transformations only where the assessed visual risk requires them.

## Visual risk assessment

Create a typed, deterministic visual-risk assessment model.

Use repository conventions, but the result should conceptually support categories such as:

```ts
type VisualRisk =
  | 'none'
  | 'minor-present'
  | 'minor-in-danger'
  | 'minor-horror'
  | 'death-reference'
  | 'visible-injury'
  | 'disturbing-body-feature'
  | 'bedroom-vulnerability'
  | 'sexual-context'
  | 'graphic-violence'
  | 'self-harm'
  | 'generated-text'
  | 'identity-conflict'
  | 'prompt-contradiction'
  | 'ambiguous';
```

The assessment should produce structured output similar to:

```ts
interface SceneVisualRiskAssessment {
  risks: VisualRisk[];
  severity: 'none' | 'low' | 'medium' | 'high';
  shouldAbstractSubject: boolean;
  shouldRemoveVisiblePeople: boolean;
  shouldSuppressReadableText: boolean;
  shouldAvoidVictimDepiction: boolean;
  shouldAvoidExplicitAnatomy: boolean;
  shouldUseEnvironmentalEvidence: boolean;
  reasons: string[];
}
```

Adapt names to the project’s conventions.

Do not rely only on naive keyword matching.

Use a layered approach:

1. deterministic phrase and field analysis;
2. relationship and combination checks;
3. optional semantic rewrite or model-based assessment only if the repository already supports it or it can be added cleanly and cheaply.

Combination risks matter more than isolated words.

Examples:

- `children` alone is not necessarily high risk;
- `children` plus `dead`, `injured`, `black eyes`, `bedroom`, `bed`, `victim`, or direct threat should trigger abstraction;
- a newspaper alone is safe;
- a newspaper explicitly depicting deceased minors is not;
- a recorder alone is safe;
- “screen shows the warning” conflicts with `textRequirement.required === false`.

The assessment must examine relevant scene fields collectively, not only `imagePrompt`.

## Safety abstraction strategies

Implement typed visual abstraction levels:

```ts
enum VisualAbstractionLevel {
  Literal = 0,
  ObscuredSubject = 1,
  EnvironmentalEvidence = 2,
  ObjectOnly = 3,
}
```

Names may differ, but the behavior should be equivalent.

### Literal

Use the intended scene directly when it is acceptable.

### Obscured subject

Preserve the person or entity but make identity or disturbing details indirect:

- silhouette;
- back view;
- distant figure;
- face obscured by shadow;
- reflection;
- frosted glass;
- partial framing;
- off-screen presence;
- no identifiable facial detail.

### Environmental evidence

Represent the event through:

- wet footprints or rainwater marks;
- open or closed doors;
- shadows;
- disturbed objects;
- case files;
- face-down photographs;
- unreadable newspaper clippings;
- recorder waveforms;
- blinking indicators;
- empty chairs;
- empty beds;
- damaged or displaced props;
- unusual reflections;
- unexplained light.

### Object only

Use the important prop or setting without visible people:

- telephone;
- recorder;
- case folder;
- doorway;
- room;
- nightstand;
- vehicle interior;
- evidence table;
- window;
- archival material.

Do not use generic “cinematic documentary background” as the fallback unless no meaningful visual details exist.

Every fallback should remain specific to the scene.

## Minors and vulnerable subjects

When a scene combines minors or child-like subjects with any of the following:

- danger;
- threat;
- death;
- visible injury;
- disturbing anatomy;
- black or missing eyes;
- bedroom vulnerability;
- sleeping people;
- victim photography;
- graphic supernatural transformation;
- sexualized context;

do not directly depict identifiable minors in the final provider prompt.

Instead:

- imply presence through silhouettes, shadows, reflections, footprints, doors, objects, or distant obscured figures;
- avoid visible injuries, bodies, victim photographs, or explicit anatomical abnormalities;
- avoid placing child-like figures directly beside beds or sleeping people;
- explicitly state `no visible facial details` where appropriate;
- preserve the scene’s horror through composition, lighting, absence, and evidence.

Do not add phrases such as “safe,” “policy-compliant,” or “allowed content” to provider prompts. Describe the desired image directly.

## Death and victim references

When a scene references death, prior victims, missing people, or an old case:

Prefer:

- closed or open case folders;
- dates;
- evidence tags without readable text;
- unreadable clippings;
- face-down or indistinct photographs;
- empty locations;
- abandoned personal objects;
- tape recorders;
- maps;
- handwritten notes without legible wording.

Avoid:

- bodies;
- corpses;
- graphic injury;
- explicit victim photographs;
- direct depiction of deceased minors;
- readable sensational headlines;
- visible suffering.

## Text handling

Fix local validation conflicts around text.

If:

```ts
scene.textRequirement.required === false
```

then the final provider prompt must not ask for readable text in:

- screens;
- recorders;
- phones;
- newspapers;
- notes;
- reports;
- labels;
- signs;
- documents;
- monitors;
- photographs;
- captions.

Automatically append a concise instruction equivalent to:

```text
No readable words, captions, labels, headlines, signs, or screen text.
```

Do not rely only on `no subtitles`, because text embedded in props is not necessarily a subtitle.

Rewrite phrases such as:

- “the screen shows the warning”;
- “the newspaper headline reads”;
- “the report says”;
- “the phone displays”;

into visual equivalents such as:

- waveform;
- blinking indicator;
- indistinct screen glow;
- circled dates;
- unreadable notes;
- highlighted document sections;
- notification light;
- generic interface shapes without legible text.

If text is required:

- use `onScreenText` as the authoritative value;
- validate that it is present;
- preserve exact spelling;
- avoid duplicating the same text in multiple prompt sections;
- keep provider-specific text limitations in mind.

## Prompt construction

Create a single authoritative prompt-building service or module.

It should produce a typed result similar to:

```ts
interface ProcessedImagePrompt {
  sceneId: string;
  prompt: string;
  abstractionLevel: VisualAbstractionLevel;
  riskAssessment: SceneVisualRiskAssessment;
  sourceFields: string[];
  transformations: PromptTransformation[];
  warnings: string[];
}
```

A transformation should be auditable:

```ts
interface PromptTransformation {
  ruleId: string;
  field?: string;
  before?: string;
  after?: string;
  reason: string;
}
```

Avoid persisting sensitive provider internals or chain-of-thought. Persist only concise, operational transformation reasons.

The final prompt should be concise and concrete.

A good structure is:

1. primary subject or object;
2. action or visual state;
3. setting;
4. important props;
5. composition;
6. camera framing;
7. lighting and mood;
8. visual style;
9. required negative constraints.

Avoid duplicated phrases.

Avoid contradictions.

Avoid abstract story-analysis language such as:

- “the discovery changed everything”;
- “the threat understood the plan”;
- “the evidence supports several interpretations”;
- “the event became deliberate”.

Convert those ideas into visible details.

For example:

Bad:

```text
The discovery changed the meaning of everything that came before.
```

Better:

```text
An old case folder lies open beside a recorder with an active waveform, while the motel doorway remains dark in the background.
```

## Continuity and character references

Preserve existing character continuity behavior.

When a scene uses a known character:

- reuse existing character-reference images or character-map data;
- avoid regenerating character references unnecessarily;
- preserve stable age, clothing, hairstyle, build, and visual identity;
- do not introduce a new visible character merely because narration mentions one;
- if safety abstraction requires removing or obscuring a character, do not corrupt the shared character definition.

The abstraction applies to the scene prompt, not to the canonical character map.

Do not create child character-reference images for scenes that should use silhouettes or environmental implication unless the existing pipeline explicitly requires them and they are safe.

## Validation

Create or improve a deterministic prompt validator.

It should detect:

- requests for readable text when text is disabled;
- empty or meaningless prompts;
- duplicate prompt sections;
- contradictory positive and negative constraints;
- conflicting subject and action;
- direct depiction of vulnerable minors in unsafe combinations;
- direct victim depiction;
- explicit graphic anatomy;
- unsupported aspect ratios;
- malformed provider parameters;
- prompt length beyond configured limits;
- accidental inclusion of raw narration;
- accidental inclusion of JSON, Markdown, or instruction syntax;
- prompt-injection-like text originating from story content;
- schema violations.

Do not make the validator bounce indefinitely.

Return typed validation results:

```ts
interface PromptValidationResult {
  valid: boolean;
  errors: PromptValidationIssue[];
  warnings: PromptValidationIssue[];
}
```

Every issue must include:

- stable code;
- message;
- affected field where known;
- whether it is retryable;
- recommended abstraction level or rewrite action.

Do not use plain string errors where a typed error is appropriate.

## Retry behavior

Replace repeated retries using nearly identical prompts with semantic escalation.

Recommended flow:

1. build literal prompt;
2. validate locally;
3. submit if valid;
4. on a confirmed provider safety rejection, move to `ObscuredSubject`;
5. rebuild and validate;
6. retry once;
7. on another confirmed safety rejection, move to `EnvironmentalEvidence`;
8. rebuild and validate;
9. retry once;
10. optionally use `ObjectOnly` as the final fallback;
11. fail with a typed, actionable error if all levels fail.

Do not:

- retry the identical prompt;
- loop indefinitely;
- mutate the canonical scene;
- swallow provider errors;
- classify timeouts, rate limits, billing failures, or network failures as safety failures.

Create reliable provider-error classification for at least:

- safety rejection;
- local validation rejection;
- rate limit;
- timeout;
- billing or quota;
- authentication;
- transient server error;
- permanent invalid request;
- unknown error.

Use bounded retries and existing repository retry conventions.

Safety retries should be separate from transient-network retries.

## Cost and performance

Keep the safety processing cheap and fast.

Prefer deterministic local analysis and rewriting.

Do not add a separate expensive language-model call for every scene unless clearly justified.

If an LLM-based rewrite is implemented:

- make it optional;
- batch compatible where possible;
- cache by stable content hash;
- use a small, configurable model;
- persist request metadata;
- enforce strict output schemas;
- fall back to deterministic rewriting;
- do not block generation if the optional rewrite service fails.

Avoid regenerating already successful images.

Resume commands must:

- detect existing valid outputs;
- process only missing or failed scenes;
- reuse previously processed prompts where configuration and input hashes match;
- invalidate cached prompts when relevant scene data or prompt-policy versions change.

Introduce a prompt-policy version, for example:

```ts
const IMAGE_PROMPT_POLICY_VERSION = '2';
```

Use it in cache keys and persisted state.

## Persistence and auditability

Persist enough information to diagnose failures.

For each scene generation attempt, store or log:

- scene ID;
- prompt-policy version;
- provider;
- model;
- requested size or aspect ratio;
- quality;
- abstraction level;
- prompt hash;
- processed prompt;
- transformation summary;
- local validation result;
- attempt number;
- provider outcome;
- classified failure type;
- retry decision;
- output filename;
- timestamps;
- duration;
- estimated or actual cost where supported.

Do not overwrite prior attempt records.

Use a structured attempt history.

Do not persist secrets, API keys, authorization headers, or raw internal provider diagnostics containing sensitive data.

Use the repository’s existing state/output folder conventions. If those conventions are inconsistent, document the inconsistency and implement the smallest safe normalization.

## Existing scene schema

Keep existing scene JSON compatible.

Prefer computed runtime metadata and separate persisted processing-state files over adding many new properties to scene JSON.

If schema changes are genuinely needed:

- make every new field optional;
- update runtime validation;
- update TypeScript types;
- update JSON Schema, Zod, Joi, TypeBox, or other schema definitions used by the project;
- update tests;
- preserve old scene files;
- document migration behavior.

Do not modify existing scene data during normal prompt processing.

## CLI behavior

Inspect the current CLI command structure and preserve existing commands where possible.

Improve image-related commands so users can:

- generate all scene images;
- resume failed or missing images;
- regenerate one scene;
- regenerate a range;
- force a selected abstraction level;
- dry-run prompt processing without calling the provider;
- print a safety and validation report;
- explain why a scene was rewritten;
- optionally force prompt-cache invalidation.

Use existing singular or plural command conventions consistently.

Do not silently introduce a second competing command namespace.

Example capabilities, adapted to the repository’s actual CLI style:

```bash
... image generate --episode <slug>
... image resume --episode <slug>
... image regenerate --episode <slug> --scene scene-022
... image prompts --episode <slug> --dry-run
... image prompts --episode <slug> --report
... image regenerate --episode <slug> --scene scene-022 --abstraction environmental
```

Do not copy these examples blindly. First inspect the existing CLI and integrate consistently.

## Reporting

Add a concise post-run report.

It should include:

- total scenes;
- skipped existing images;
- successfully generated images;
- local validation failures;
- provider safety rejections;
- recovered safety rejections;
- unrecovered failures;
- abstraction-level counts;
- retries by category;
- total provider calls;
- cache hits;
- elapsed time;
- cost estimate where available.

For each rewritten scene, provide a compact explanation such as:

```text
scene-022:
- detected minor-horror + disturbing-body-feature
- changed Literal -> ObscuredSubject
- replaced visible facial anomaly with a distant shadow-obscured figure
- preserved motel corridor, archival evidence, framing, and mood
```

## Logging and observability

Use structured logs.

Include:

- episode slug;
- scene ID;
- attempt number;
- abstraction level;
- error category;
- provider;
- model;
- prompt-policy version;
- output path;
- duration.

Avoid logging API keys or authorization data.

Use existing logger abstractions rather than `console.log`, unless the CLI layer intentionally formats user-facing output.

Add metrics or hooks if the repository already has observability infrastructure.

Useful metrics include:

- `image_generation_attempts_total`;
- `image_generation_safety_rejections_total`;
- `image_generation_safety_recoveries_total`;
- `image_prompt_validation_failures_total`;
- `image_prompt_cache_hits_total`;
- `image_generation_duration_seconds`;
- `image_generation_cost_estimate`.

Do not add a heavy metrics dependency solely for this feature.

## Testing

Add comprehensive tests.

At minimum include unit tests for:

1. normal adult scene remains literal;
2. child in a harmless daytime scene is not unnecessarily removed;
3. child plus threat triggers abstraction;
4. child plus death triggers environmental evidence;
5. child plus black eyes triggers obscured-subject handling;
6. child plus bed or bedroom vulnerability avoids direct depiction;
7. death reference produces files or evidence, not a body;
8. `textRequirement.required === false` removes readable-text requests;
9. `textRequirement.required === true` preserves exact `onScreenText`;
10. “screen shows warning” is converted to waveform or indicator state;
11. no raw narration is appended to the provider prompt;
12. conflicting constraints are detected;
13. prompt transformation history is recorded;
14. safety rejection escalates abstraction;
15. timeout does not escalate safety abstraction;
16. rate limit follows transient retry behavior;
17. retries are bounded;
18. successful existing images are skipped;
19. cache invalidates when policy version changes;
20. old scene JSON remains valid;
21. processing does not mutate the input scene;
22. provider request contains only allowed fields;
23. dry-run does not call the image provider;
24. one-scene regeneration affects no unrelated scenes;
25. report counts are correct.

Add integration tests around the image-generation orchestration using mocked providers.

Use deterministic fixtures.

Include fixtures based on generic scenarios rather than only one specific story.

Example fixtures should cover:

- motel doorway with implied child presence;
- recorder and unreadable notes;
- supernatural eyes represented through shadow;
- cold-case files referencing young victims;
- wet footprints inside an empty bedroom;
- harmless family scene;
- adult horror scene;
- generated-text requirement.

Do not call paid external APIs in tests.

## Documentation

Update the relevant documentation.

Document:

- how scene narration differs from visual prompts;
- how final prompts are built;
- risk categories;
- abstraction levels;
- retry escalation;
- text handling;
- caching;
- persisted attempt history;
- CLI commands;
- dry-run usage;
- how to diagnose a safety rejection;
- how to add a new visual rewrite rule;
- how to add a provider-specific error classifier;
- how to regenerate one failed scene safely.

Add concrete before-and-after examples.

Example:

Before:

```text
A child looks up with completely black eyes.
```

After:

```text
A short human silhouette stands at the far end of a dim motel corridor, face obscured by deep shadow and reflected hallway light, no visible facial details.
```

Example:

Before:

```text
The report says two children were found dead.
```

After:

```text
An old case folder and weathered newspaper clipping lie open beneath a dim lamp, archival photographs turned face-down, no readable text, no people.
```

Example:

Before:

```text
Two wet footprints stop beside his bed.
```

After:

```text
An empty motel room at dawn, two narrow sets of wet footprints beginning inexplicably inside the locked room and fading beside an unoccupied nightstand, empty bed partly visible, no people.
```

## Implementation workflow

Perform the work in this order:

1. inspect the repository;
2. identify the current end-to-end image flow;
3. identify current bugs, duplicated logic, and unsafe prompt composition;
4. write an implementation plan;
5. create or update repository task files using the project’s existing task format;
6. implement the smallest cohesive architecture;
7. add tests;
8. run formatting, linting, type checking, and relevant test suites;
9. fix failures caused by the changes;
10. update documentation;
11. provide a final implementation report.

Do not stop after analysis or planning.

Implement the approved recommendations directly.

## Required implementation report

At the end, provide:

1. repository areas inspected;
2. root causes found;
3. files changed;
4. architectural changes;
5. schema compatibility impact;
6. new risk categories;
7. new abstraction behavior;
8. retry and error-classification behavior;
9. caching behavior;
10. CLI changes;
11. tests added;
12. commands executed;
13. validation results;
14. unresolved risks;
15. recommended follow-up tasks.

Be explicit about any assumptions.

Do not claim tests passed unless they were actually executed successfully.

Do not modify unrelated story, audio, video, metadata, upload, or localization behavior.
