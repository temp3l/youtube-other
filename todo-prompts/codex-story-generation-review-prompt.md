You are a senior TypeScript application architect, workflow designer, code reviewer, and reliability engineer.

Review the existing story-generation pipeline responsible for optimizing English source stories and generating English and localized full and short YouTube stories.

Your task is to inspect the actual implementation, document the current workflow, identify logic and architectural defects, design the target workflow, create a detailed implementation plan, and write actionable development tasks.

Do not implement the refactor yet unless a small isolated change is required to validate the review. Focus on analysis, planning, task creation, acceptance criteria, and test design.

The codebase is production-oriented. Prioritize correctness, deterministic lineage, fail-fast behavior, type safety, atomic persistence, idempotency, observability, auditability, reproducibility, and maintainability.

## Non-negotiable canonical workflow

The intended workflow is:

1. Every episode starts with an English source story.
2. The English source story is passed through the currently configured English full-story optimization prompt.
3. The optimization request and raw response are persisted in the episode’s relevant generation-history folder.
4. The optimized English full story is validated.
5. If optimization or validation fails, abort the workflow immediately.
6. No downstream content or shared artifact may be generated after such a failure.
7. The successfully validated optimized English full story becomes the canonical story artifact.
8. The English short story is generated from the canonical optimized English full story.
9. Every localized full story is generated from the canonical optimized English full story.
10. Every localized short story is generated from the canonical optimized English full story.
11. Shared semantic artifacts are generated from the canonical optimized English full story.
12. The character map is generated only once from the canonical optimized English full story.
13. The character map is stored only in the episode shared folder.
14. Localized and short-story workflows may consume the character map but may never generate, regenerate, overwrite, or relocate it.
15. Every story-related model request and response is persisted before or as part of processing the result.
16. No localized story may ever be generated directly from the original English source story.
17. No short story may ever be generated directly from the original English source story.

The central invariant is:

> No full story, short story, localized story, character map, or shared downstream story artifact may be generated unless English full-story optimization has completed successfully and the optimized English full story has passed validation.

A second mandatory invariant is:

> Every story-related model request and response must be persisted with complete provenance in the relevant episode folder, regardless of whether the request succeeds, fails, produces invalid output, or is rejected during validation.

## Required decisions already adopted

Use the following architectural decisions unless the existing codebase provides a stronger equivalent.

### Canonical source

The validated optimized English full story is the canonical source for all downstream generation.

The original English source story is input only to the English optimization step.

It must not be accepted by:

- localized full-story generation;
- localized short-story generation;
- English short-story generation;
- character-map generation;
- shared canon generation;
- scene-semantic generation;
- downstream metadata generation that depends on story content.

### Localized short-story source

Generate localized short stories directly from the canonical optimized English full story using:

- the target language;
- the canonical character map;
- canonical shared story artifacts;
- the short-story prompt.

Do not generate localized shorts from localized full stories by default.

This avoids cumulative translation drift and ensures that every short has access to the complete canonical narrative.

Localized full stories may be used as optional terminology references, but they must not be the authoritative source.

### Character-map source and lifecycle

The character map must:

- be generated only from the canonical optimized English full story;
- be stored in the episode shared folder;
- use stable character IDs;
- preserve canonical English names;
- optionally include aliases and localization guidance;
- record provenance;
- be reused only when its provenance matches the current optimized English story;
- be regenerated when the optimized English content hash, prompt version, character-map prompt version, or character-map schema version changes;
- be written atomically;
- be protected against concurrent generation;
- have its model request and raw response persisted.

A character-map file existing on disk is not sufficient proof that it is valid.

### Story request and response persistence

All story-related prompt requests and model responses must be persisted.

This applies to:

- English full-story optimization;
- English short generation;
- localized full-story generation;
- localized short-story generation;
- character-map generation;
- canon extraction;
- source-fact extraction;
- optimized-story fact extraction;
- timeline extraction;
- entity extraction;
- relationship extraction;
- continuity analysis;
- story validation performed by a model;
- metadata generation based on story content;
- retries;
- repair operations;
- batch jobs;
- synchronous generation;
- resumed generation.

Persist both successful and failed attempts.

At minimum, persist:

- the exact effective system prompt;
- the exact effective user prompt;
- prompt template identifier;
- prompt template version;
- rendered prompt hash;
- request timestamp;
- model provider;
- model;
- model parameters;
- generation mode;
- episode slug;
- operation;
- target language;
- story format;
- source artifact kind;
- source artifact path;
- source content hash;
- generation run ID;
- attempt number;
- request ID returned by the provider, when available;
- raw response body or raw response text;
- normalized extracted response;
- response hash;
- token usage, when available;
- finish reason, when available;
- provider error details;
- retryability classification;
- request duration;
- validation result;
- validation errors;
- final artifact path, when committed;
- failure category;
- status.

Do not persist secrets such as:

- API keys;
- authorization headers;
- bearer tokens;
- cookies;
- provider credentials;
- complete environment-variable dumps.

Redact secrets before writing request metadata.

The persisted request must contain the actual rendered prompt sent to the model, not only the template name.

The persisted response must preserve the original raw output before normalization, cleanup, parsing, validation, or Markdown extraction.

### Recommended request-history folder structure

Use the repository’s existing folder conventions when they already provide an equivalent structure.

Otherwise, adopt a predictable per-episode structure equivalent to:

```text
episodes/<episode-slug>/
├── shared/
│   ├── character-map.json
│   ├── canon.json
│   └── ...
├── generation-history/
│   ├── <generation-run-id>/
│   │   ├── manifest.json
│   │   ├── optimize-en-full/
│   │   │   ├── attempt-001/
│   │   │   │   ├── request.json
│   │   │   │   ├── system-prompt.md
│   │   │   │   ├── user-prompt.md
│   │   │   │   ├── response.raw.txt
│   │   │   │   ├── response.normalized.md
│   │   │   │   ├── validation.json
│   │   │   │   └── result.json
│   │   ├── character-map/
│   │   ├── rewrite-en-short/
│   │   ├── rewrite-de-full/
│   │   ├── rewrite-de-short/
│   │   ├── rewrite-es-full/
│   │   └── ...
```

Alternatively, if the repository organizes generated artifacts by language and format, a structure such as the following may be used:

```text
episodes/<episode-slug>/
├── shared/
├── en/
├── de/
├── es/
├── fr/
├── pt/
└── requests/
    └── <generation-run-id>/
        └── <operation>/
            └── attempt-001/
```

Choose one authoritative convention and apply it consistently.

Do not scatter request files throughout arbitrary output directories.

### Request-attempt identity

Every model invocation must have a stable request-attempt identity.

Use a structure equivalent to:

```ts
interface StoryGenerationAttemptIdentity {
  readonly generationRunId: string;
  readonly operation:
    | "optimize-en-full"
    | "rewrite-en-short"
    | "rewrite-localized-full"
    | "rewrite-localized-short"
    | "generate-character-map"
    | "extract-source-facts"
    | "extract-canonical-facts"
    | "validate-story";
  readonly targetLanguage?: LanguageCode;
  readonly format?: StoryFormat;
  readonly attempt: number;
}
```

Each retry must create a new immutable attempt folder.

Never overwrite the request or response from an earlier attempt.

### Persistence ordering

For every model invocation:

1. Resolve the generation-run ID and attempt ID.
2. Create the attempt directory safely.
3. Render the complete prompt.
4. Redact secrets from metadata.
5. Persist request metadata and rendered prompts.
6. Mark the attempt as `request-persisted`.
7. Invoke the provider.
8. Persist the raw provider response or provider error.
9. Persist normalized output separately.
10. Run validation.
11. Persist validation results.
12. Commit the final artifact only after validation succeeds.
13. Persist the final attempt result.
14. Update the generation-run manifest.
15. Update the episode manifest only after final artifact commit.

A provider call must not be made unless the request can first be persisted, except where the existing provider architecture makes this technically impossible. In that case, document the limitation and create a task to correct it.

A model response must be persisted before transformations that could lose information.

### Failed request persistence

Failed operations must still persist:

- rendered prompts;
- request metadata;
- provider error;
- status code, where available;
- provider request ID;
- response body, where safe;
- retry classification;
- attempt duration;
- validation failure;
- stack or internal diagnostics where appropriate;
- final attempt status.

Do not mark an attempt as successful merely because the provider returned HTTP success.

Suggested statuses include:

- `prepared`;
- `request-persisted`;
- `submitted`;
- `provider-failed`;
- `response-persisted`;
- `normalization-failed`;
- `validation-failed`;
- `artifact-committed`;
- `completed`;
- `cancelled`;
- `blocked`.

### Retention and storage policy

Review the expected storage volume and recommend a configurable retention policy.

The default recommendation is:

- persist full prompt requests and raw responses indefinitely for active production episodes;
- never silently delete generation history;
- provide an explicit archival or pruning command;
- protect canonical generation history from automatic deletion;
- allow compression of older raw response files;
- allow configurable retention by artifact type or age;
- preserve manifests and hashes even if large raw payloads are archived externally.

Suggested future commands:

```bash
stories history list --episode <slug>
stories history inspect --episode <slug> --run <run-id>
stories history verify --episode <slug>
stories history archive --episode <slug> --before <date> --dry-run
stories history prune --episode <slug> --before <date> --dry-run
```

Pruning must never run implicitly as part of story generation.

### Shared artifacts

The following should normally be canonical shared artifacts generated from the optimized English full story:

- character map;
- canonical story facts;
- fictional canon facts;
- plot timeline;
- locations;
- supernatural rules;
- entity map;
- relationship map;
- continuity constraints;
- required plot beats;
- scene-level semantic outline;
- source references;
- factual validation results;
- canonical content warnings;
- image-generation semantic context.

The following should normally be shared artifacts with localized projections:

- character aliases;
- pronunciation guidance;
- translated location labels;
- localized content warnings;
- localized entity display names;
- localized terminology preferences.

The following must remain language-specific:

- narration scripts;
- titles;
- descriptions;
- tags;
- hashtags;
- thumbnail text;
- narration instructions;
- voice instructions;
- language-specific pronunciation notes;
- localized wording;
- localized SEO metadata.

The following are format-specific:

- full narration script;
- short narration script;
- short-specific hook;
- short-specific pacing;
- full-specific scene expansion;
- format-specific audio instructions.

Do not share language-specific prose merely to reduce API calls.

## Review scope

Inspect the complete implementation, not only the most obvious CLI command.

Review all relevant code paths, including:

- `stories rewrite-full`;
- `stories rewrite-short`;
- localization commands;
- episode creation commands;
- batch generation commands;
- automated pipeline commands;
- any internal service invoking story generation;
- synchronous and batch-based generation;
- retry workflows;
- resume workflows;
- import workflows;
- regeneration workflows.

Inspect:

- CLI registration;
- command handlers;
- orchestration services;
- prompt loaders;
- prompt versioning;
- OpenAI or model-provider clients;
- source-file resolution;
- output-path resolution;
- shared-folder resolution;
- request-history path resolution;
- request serialization;
- response serialization;
- redaction;
- episode manifests;
- generation-run manifests;
- generation indexes;
- batch indexes;
- character-map extraction;
- fact extraction;
- canon extraction;
- validation;
- retries;
- fallbacks;
- process exit codes;
- logging;
- concurrency;
- temporary files;
- atomic writes;
- tests.

Search globally for every function that:

- reads an English source story;
- generates a full story;
- generates a short story;
- localizes a story;
- generates a character map;
- writes into the shared folder;
- writes prompt requests;
- writes model responses;
- updates a manifest;
- invokes the model API.

Do not assume that the primary CLI command is the only entry point.

## Current-state analysis

Document the actual workflow as implemented.

For each generation path, identify:

- command or entry point;
- handler;
- orchestration function;
- prompt used;
- source artifact;
- resolved input path;
- resolved output path;
- request-history path;
- whether the rendered prompt is persisted;
- whether raw responses are persisted;
- generated artifact;
- validation performed;
- manifest updates;
- fallback behavior;
- failure behavior;
- exit code;
- retry behavior;
- concurrency behavior.

Explicitly trace:

1. English source to optimized English full.
2. Optimized English full to English short.
3. Optimized English full to localized full.
4. Optimized English full to localized short.
5. Optimized English full to character map.
6. Optimized English full to other shared artifacts.
7. Resume or regeneration paths.
8. Batch-generation paths.
9. Prompt request persistence.
10. Raw response persistence.
11. Retry-attempt persistence.

Create Mermaid diagrams where useful.

## Canonical-source enforcement review

Answer the following based on actual code:

- Where is the original English source loaded?
- Where is the optimized English story generated?
- How is it persisted?
- How is success determined?
- Is there semantic validation or only a successful API response?
- Can downstream generation start before persistence completes?
- Can downstream generation start before validation completes?
- Can localized generation read the source English file?
- Can short-story generation read the source English file?
- Can generic path parameters bypass the intended source?
- Can stale optimized files be mistaken for current output?
- Can localized files be reused after the canonical story changes?
- Can fallback logic silently use the original source story?
- Can missing optimized output trigger an implicit source fallback?
- Can a generic `string`, `content`, or `inputPath` parameter represent both source and optimized stories?
- Are source and canonical stories distinguishable in types and metadata?
- Are prompt versions recorded?
- Are content hashes recorded?

Treat any path that permits localization from the source English story as a critical defect.

## Prompt request and response persistence review

Answer the following based on actual code:

- Are rendered prompts currently persisted?
- Are only templates stored, or the exact final prompts?
- Are system and user prompts stored separately?
- Are prompt parameters stored?
- Are prompt versions stored?
- Are raw model responses stored before parsing?
- Are normalized outputs stored separately from raw responses?
- Are failed provider responses persisted?
- Are validation failures persisted?
- Are retries preserved as separate immutable attempts?
- Can a later retry overwrite an earlier request or response?
- Are provider request IDs stored?
- Is token usage stored?
- Is finish reason stored?
- Are model parameters stored?
- Are request and response hashes stored?
- Are secrets redacted?
- Can the full generation lineage be reconstructed later?
- Can an output artifact be linked to the exact prompt and response that created it?
- Can request-history files be corrupted by parallel workers?
- Are request-history writes atomic?
- Are request-history folders included in cleanup routines that might delete them unexpectedly?
- Is there a clear retention policy?
- Can batch responses be mapped reliably to individual requests?
- Are batch IDs and custom IDs persisted?
- Does resume logic reuse persisted attempts correctly?
- Can a completed response be imported after a delayed batch finishes?

Treat missing raw request or response persistence as a high-severity auditability defect.

Treat overwriting earlier generation attempts as a high-severity provenance defect.

## Failure-handling review

Inspect whether a failed optimization:

- terminates the current workflow;
- returns a typed failure;
- propagates to the CLI;
- produces a non-zero process exit code;
- prevents localization;
- prevents short generation;
- prevents character-map generation;
- prevents shared-artifact generation;
- prevents success manifest entries;
- cancels or blocks queued downstream work;
- leaves temporary files;
- leaves partially written final files;
- leaves misleading manifest state;
- retries only retryable failures;
- emits actionable logs;
- persists the failed request and response details.

Classify failures into at least:

- provider or transport failure;
- timeout;
- rate limit;
- invalid model output;
- refusal;
- empty output;
- malformed Markdown or JSON;
- semantic validation failure;
- filesystem failure;
- request-persistence failure;
- response-persistence failure;
- manifest failure;
- concurrency conflict;
- stale dependency;
- unsupported input;
- configuration error.

Do not use silent fallback to the source English story.

## Required type-safety recommendations

Review whether the code uses overly generic APIs such as:

```ts
generateStory(input: string, language: string): Promise<string>;
```

Recommend semantic domain types that prevent invalid source usage.

Use an approach equivalent to:

```ts
type LanguageCode = string;

type StoryFormat = "full" | "short";

interface SourceEnglishStory {
  readonly kind: "source-english";
  readonly episodeSlug: string;
  readonly path: string;
  readonly content: string;
  readonly contentHash: string;
}

interface OptimizedEnglishStory {
  readonly kind: "optimized-english";
  readonly episodeSlug: string;
  readonly language: "en";
  readonly format: "full";
  readonly path: string;
  readonly content: string;
  readonly contentHash: string;
  readonly promptVersion: string;
  readonly model: string;
  readonly generationRunId: string;
  readonly generationAttemptId: string;
  readonly generatedAt: string;
  readonly validationStatus: "validated";
}

interface LocalizedStoryRequest {
  readonly source: OptimizedEnglishStory;
  readonly targetLanguage: LanguageCode;
  readonly format: StoryFormat;
}

interface CharacterMapRequest {
  readonly source: OptimizedEnglishStory;
  readonly sharedDirectory: string;
}

interface StoryPromptRequestRecord {
  readonly schemaVersion: number;
  readonly generationRunId: string;
  readonly attemptId: string;
  readonly operation: string;
  readonly episodeSlug: string;
  readonly targetLanguage?: LanguageCode;
  readonly format?: StoryFormat;
  readonly sourceArtifactKind: string;
  readonly sourceArtifactPath: string;
  readonly sourceContentHash: string;
  readonly promptTemplateId: string;
  readonly promptTemplateVersion: string;
  readonly renderedPromptHash: string;
  readonly provider: string;
  readonly model: string;
  readonly requestedAt: string;
}

interface StoryPromptResponseRecord {
  readonly schemaVersion: number;
  readonly generationRunId: string;
  readonly attemptId: string;
  readonly providerRequestId?: string;
  readonly rawResponsePath?: string;
  readonly normalizedResponsePath?: string;
  readonly responseHash?: string;
  readonly finishReason?: string;
  readonly durationMs: number;
  readonly status:
    | "provider-failed"
    | "response-persisted"
    | "validation-failed"
    | "artifact-committed"
    | "completed";
}
```

Adapt the names and structures to existing conventions.

Prefer:

```ts
generateLocalizedFullStory(
  source: OptimizedEnglishStory,
  targetLanguage: LanguageCode,
): Promise<LocalizedStory>;
```

and:

```ts
generateCharacterMap(
  source: OptimizedEnglishStory,
): Promise<CharacterMap>;
```

Avoid:

```ts
generateLocalizedStory(
  inputPath: string,
  language: string,
): Promise<void>;
```

The supported public APIs should make it impossible or clearly invalid to pass `SourceEnglishStory` into downstream generators.

Do not recommend:

- `any`;
- broad type assertions;
- non-null assertions;
- untyped metadata;
- stringly typed states;
- catch-all error swallowing.

Use discriminated unions and exhaustive handling for workflow states and result types.

## Required orchestration design

Recommend one authoritative orchestration service for the story pipeline.

It should enforce this dependency graph:

```text
English source
    |
    v
Persist optimization request
    |
    v
Optimize English full
    |
    v
Persist raw optimization response
    |
    v
Validate optimized English
    |
    v
Persist validation result
    |
    v
Persist canonical optimized English
    |
    v
Publish canonical-ready state
    |
    +--> Persist request -> Generate character map -> Persist response
    |
    +--> Persist request -> Generate shared canon/facts/timeline -> Persist response
    |
    +--> Persist request -> Generate English short -> Persist response
    |
    +--> Persist request -> Generate localized full: de -> Persist response
    |
    +--> Persist request -> Generate localized short: de -> Persist response
    |
    +--> Persist request -> Generate localized full: es -> Persist response
    |
    +--> Persist request -> Generate localized short: es -> Persist response
    |
    +--> Persist request -> Generate localized full: fr -> Persist response
    |
    +--> Persist request -> Generate localized short: fr -> Persist response
    |
    +--> Persist request -> Generate localized full: pt -> Persist response
    |
    +--> Persist request -> Generate localized short: pt -> Persist response
```

Nothing below the canonical-ready state may execute before successful validation and persistence.

The orchestration layer should:

- load the English source;
- create a generation-run ID;
- call the current optimization prompt;
- persist the exact rendered request;
- invoke the provider;
- persist the raw response;
- validate model output;
- persist validation results;
- persist canonical output atomically;
- construct the typed canonical artifact;
- update the manifest;
- generate or validate shared artifacts;
- release downstream jobs;
- persist every downstream request and response;
- aggregate failures;
- expose a single structured result;
- provide correct CLI exit semantics.

Low-level generators must not independently resolve arbitrary source files.

## Validation requirements

Plan explicit validation at every boundary.

### English optimized full-story validation

Validate:

- non-empty content;
- expected English language;
- expected full-story format;
- configured minimum and maximum word count;
- required Markdown sections;
- narration-script presence;
- no unresolved placeholders;
- no prompt leakage;
- no model refusal;
- no malformed fences;
- no accidental JSON wrapper unless expected;
- no duplicated narration section;
- no unexpected language switching;
- required protagonist preserved;
- required characters preserved;
- central horror concept preserved;
- supernatural rule preserved;
- major escalation beats preserved;
- final reveal preserved;
- not reduced to a synopsis;
- metadata and production instructions remain structurally valid.

The validation result must be typed and persisted.

A provider success response is not equivalent to a valid optimized story.

### Localized full-story validation

Validate:

- source hash matches current canonical English;
- target language matches the request;
- expected full-story word range;
- core story invariants preserved;
- character IDs and canonical identities preserved;
- supernatural rule preserved;
- major beats preserved;
- final reveal preserved;
- Markdown structure valid;
- required instruction-language policy followed;
- no source prompt leakage;
- no accidental use of original source content;
- no unsupported name changes;
- no generic summary output.

### Short-story validation

Validate:

- direct dependency on current canonical English hash;
- expected target language;
- expected short word or duration range;
- central threat preserved;
- supernatural rule preserved;
- escalation preserved;
- final reveal preserved;
- character naming consistent with the character map;
- no contradictory canon;
- no generic synopsis;
- no full-story metadata accidentally copied into the narration;
- no excessive setup that weakens retention.

### Character-map validation

Validate:

- generated from current canonical English hash;
- schema version supported;
- stable IDs present;
- canonical names present;
- duplicate identities resolved;
- aliases structured;
- no localized story treated as source;
- no narration prose stored unnecessarily;
- provenance complete.

## Source facts and canon validation

Adopt the following two-stage approach.

Before or during English optimization:

1. Extract important facts and story invariants from the source English story.
2. Persist the fact-extraction request and raw response.
3. Optimize the English full story.
4. Persist the optimization request and raw response.
5. Extract canonical facts and invariants from the optimized English story.
6. Persist the canonical fact-extraction request and raw response.
7. Compare source invariants against optimized-story invariants.
8. Persist the comparison and validation result.
9. Reject optimization when critical information has been lost or contradicted.

Store separately:

- source-derived invariants;
- optimized canonical invariants;
- comparison and validation result.

Downstream localization must use the optimized canonical invariants.

Do not allow localization to reintroduce discarded source wording merely because it appeared in the original story.

Suggested invariants include:

- protagonist identity;
- important supporting characters;
- setting;
- threat;
- supernatural rule;
- key objects;
- major escalation events;
- survival mechanism;
- ending;
- final reveal;
- chronology;
- relationships;
- facts that must not change during localization.

## Shared-artifact policy

Create an explicit artifact registry or policy rather than scattering decisions through CLI handlers.

For every artifact define:

- artifact kind;
- canonical source kind;
- scope;
- storage resolver;
- request-history resolver;
- schema version;
- prompt version;
- direct dependency hash;
- invalidation rules;
- localization permissions;
- overwrite policy;
- validation function.

Classify each artifact as:

1. Canonical shared.
2. Shared with localized projections.
3. Language-specific.
4. Format-specific.
5. Derived and invalidated by dependency changes.
6. Generation-history or audit artifact.

Create a review table containing:

- artifact;
- current source;
- required source;
- current location;
- required location;
- request-history location;
- scope;
- direct dependency;
- invalidation trigger;
- localization write permissions;
- regeneration policy.

## Character-map storage and ownership

The target location should be resolved through one centralized episode-path service, for example:

```text
episodes/<episode-slug>/shared/character-map.json
```

Use the repository’s existing folder conventions if different, but keep it language-independent and inside the shared episode folder.

The character map must not be stored in:

- `en`;
- `de`;
- `es`;
- `fr`;
- `pt`;
- full-story output folders;
- short-story output folders;
- generated localization folders;
- generation-history folders as the final canonical copy.

Its request and response history should be stored in generation history, but the validated canonical character map must be stored in the shared folder.

Only the canonical-English orchestration stage may create or update it.

Localization and short-generation code must receive it as a read-only dependency.

## Provenance and manifest requirements

Review the current manifest and index structure.

Extend the existing manifest rather than introducing a competing metadata system.

Every artifact must record:

- episode slug;
- artifact kind;
- language;
- format;
- path;
- content hash;
- direct source artifact;
- direct source content hash;
- prompt template ID;
- prompt version;
- rendered prompt hash;
- model;
- provider;
- provider request ID, when available;
- generation run ID;
- generation attempt ID;
- request-history path;
- response-history path;
- schema version where relevant;
- generation timestamp;
- validation status;
- validation version;
- generation status;
- failure category where relevant.

Use a structure equivalent to:

```json
{
  "episodeSlug": "example-episode",
  "source": {
    "kind": "source-english",
    "language": "en",
    "path": "...",
    "contentHash": "..."
  },
  "canonical": {
    "kind": "optimized-english",
    "language": "en",
    "format": "full",
    "path": "...",
    "contentHash": "...",
    "promptTemplateId": "...",
    "promptVersion": "...",
    "renderedPromptHash": "...",
    "model": "...",
    "provider": "...",
    "generationRunId": "...",
    "generationAttemptId": "...",
    "requestHistoryPath": "...",
    "responseHistoryPath": "...",
    "generatedAt": "...",
    "status": "validated"
  },
  "sharedArtifacts": {
    "characterMap": {
      "path": "...",
      "sourceArtifact": "optimized-english",
      "sourceContentHash": "...",
      "schemaVersion": 1,
      "promptVersion": "...",
      "generationAttemptId": "...",
      "requestHistoryPath": "...",
      "responseHistoryPath": "...",
      "status": "validated"
    },
    "canon": {
      "path": "...",
      "sourceContentHash": "...",
      "schemaVersion": 1,
      "generationAttemptId": "...",
      "status": "validated"
    }
  },
  "outputs": {
    "en": {
      "short": {
        "path": "...",
        "sourceContentHash": "...",
        "generationAttemptId": "...",
        "requestHistoryPath": "...",
        "responseHistoryPath": "...",
        "status": "validated"
      }
    },
    "de": {
      "full": {
        "path": "...",
        "sourceContentHash": "...",
        "generationAttemptId": "...",
        "requestHistoryPath": "...",
        "responseHistoryPath": "...",
        "status": "validated"
      },
      "short": {
        "path": "...",
        "sourceContentHash": "...",
        "generationAttemptId": "...",
        "requestHistoryPath": "...",
        "responseHistoryPath": "...",
        "status": "validated"
      }
    }
  }
}
```

Adapt this to current repository schemas.

A derived artifact is stale when:

- its source content hash differs;
- its prompt version differs;
- its rendered prompt hash differs where relevant;
- its schema version differs;
- its validation version differs;
- its generation policy changed;
- a required shared artifact changed.

Do not treat file existence as validity.

## Generation-run manifest

Each generation run should have its own immutable or append-only manifest.

Use a structure equivalent to:

```json
{
  "schemaVersion": 1,
  "generationRunId": "...",
  "episodeSlug": "...",
  "startedAt": "...",
  "completedAt": null,
  "status": "running",
  "operations": [
    {
      "attemptId": "...",
      "operation": "optimize-en-full",
      "attempt": 1,
      "targetLanguage": "en",
      "format": "full",
      "requestPath": "...",
      "rawResponsePath": "...",
      "normalizedResponsePath": "...",
      "validationPath": "...",
      "status": "completed"
    }
  ]
}
```

Do not overwrite history from earlier runs.

## Atomic persistence requirements

Review and recommend atomic persistence for all canonical, shared, request-history, and response-history artifacts.

Use this pattern:

1. Generate into memory or a temporary file.
2. Validate serialization where appropriate.
3. Write to a temporary path in the same filesystem.
4. Flush when appropriate.
5. Atomically rename to the final path.
6. Update the relevant manifest only after the file is successfully committed.
7. Clean up temporary files on failure.

Apply this to:

- request metadata;
- rendered system prompts;
- rendered user prompts;
- raw responses;
- normalized responses;
- validation results;
- attempt results;
- generation-run manifests;
- canonical optimized English story;
- character map;
- canonical facts;
- timeline;
- localized stories;
- short stories;
- episode manifests;
- batch indexes.

Never expose partially written final files.

## Concurrency requirements

Review concurrent execution for:

- two optimization processes for one episode;
- simultaneous localization jobs;
- simultaneous character-map generation;
- simultaneous generation-history writes;
- simultaneous manifest updates;
- batch and synchronous generation running together;
- retry workers;
- resume commands.

Recommend:

- a per-episode canonical-generation lock;
- a shared-artifact write lock;
- unique immutable attempt directories;
- lock metadata containing process or run identity;
- stale-lock recovery;
- bounded lock waiting;
- explicit lock failure errors;
- concurrent localized generation only after canonical readiness;
- one authoritative manifest mutation service;
- compare-and-swap or serialized manifest writes;
- deterministic artifact keys;
- idempotent operations.

Generation-history attempts should never share mutable files.

The character map must not be generated independently by every localization worker.

## Idempotency and regeneration

Define deterministic behavior.

For each operation:

- calculate source hash;
- calculate rendered prompt hash;
- inspect manifest provenance;
- validate existing artifact;
- verify request and response history exists;
- skip only when artifact and provenance are valid;
- regenerate when stale;
- never reuse unknown-lineage artifacts as valid;
- support `--force`;
- support `--dry-run`;
- support audit-only mode.

Distinguish statuses such as:

- `missing`;
- `prepared`;
- `request-persisted`;
- `submitted`;
- `response-persisted`;
- `generating`;
- `validated`;
- `failed`;
- `stale`;
- `legacy-unknown-lineage`;
- `needs-regeneration`;
- `blocked-by-canonical-failure`.

## Logging and observability

Review current logs and recommend structured logging.

Every generation event should include:

- generation run ID;
- generation attempt ID;
- episode slug;
- command;
- operation;
- source artifact kind;
- source path;
- source content hash;
- target language;
- format;
- prompt template ID;
- prompt version;
- rendered prompt hash;
- provider;
- model;
- provider request ID;
- attempt;
- duration;
- output path;
- request-history path;
- response-history path;
- validation result;
- failure category;
- retryability;
- lock information;
- cache or reuse decision.

Never log by default:

- full story content;
- complete prompts;
- raw responses;
- API keys;
- authorization headers;
- model-provider secrets;
- sensitive raw payloads.

Full prompts and responses belong in protected persisted history files, not normal application logs.

Add duration metrics for:

- source loading;
- request persistence;
- provider invocation;
- response persistence;
- optimization;
- validation;
- shared-artifact generation;
- localization;
- short generation;
- final artifact persistence;
- manifest update.

## Security and path safety

Review:

- episode slug validation;
- language-code validation;
- path traversal;
- symlink behavior;
- arbitrary input paths;
- output overwrites;
- unsafe temporary directories;
- request-history path construction;
- response-history path construction;
- file permissions;
- malformed manifest paths;
- untrusted Markdown or JSON;
- shell command construction;
- secret redaction;
- accidental credential persistence.

All output paths should be resolved through centralized safe path utilities.

Do not allow a user-provided episode slug, language, operation name, run ID, or attempt ID to escape the episode root.

Generation-history files may contain complete prompts and raw responses and should therefore use appropriate filesystem permissions.

## Batch API considerations

Review batch request handling separately.

Ensure:

- every batch item has a stable custom ID;
- the custom ID maps to episode, operation, language, format, run ID, and attempt ID;
- submitted batch request payloads are persisted;
- provider batch IDs are persisted;
- batch status checks are persisted;
- downloaded result files are persisted;
- each returned item is mapped to exactly one request attempt;
- failed items preserve provider errors;
- retries create new attempts;
- original requests are never overwritten;
- delayed responses can be imported safely;
- batch completion does not bypass validation;
- failed canonical optimization blocks downstream batch items.

## Required deliverables

Write the review using the repository’s existing documentation and task conventions.

Create or update files in the appropriate planning or documentation directory.

The review must contain the following sections.

## 1. Executive summary

Include:

- current overall risk;
- most severe defects;
- whether the canonical invariant is currently guaranteed;
- whether localized stories can currently use the original source;
- whether failures currently abort safely;
- whether the character map has a single owner;
- whether prompts and responses are currently persisted completely;
- whether retries preserve immutable history;
- recommended implementation order.

## 2. Current-state workflow

Document the exact current execution path.

Include:

- commands;
- handlers;
- services;
- prompts;
- source paths;
- output paths;
- request-history paths;
- response-history paths;
- manifest writes;
- fallback behavior;
- retries;
- shared-artifact generation;
- character-map generation;
- failure propagation.

Cite concrete files, classes, functions, and symbols.

Include Mermaid diagrams.

## 3. Findings

For every finding include:

- ID;
- severity: critical, high, medium, or low;
- category;
- affected files;
- affected symbols;
- confirmed current behavior;
- expected behavior;
- reproduction or failure scenario;
- production impact;
- recommendation.

Clearly distinguish confirmed defects from optional improvements.

Prioritize:

1. direct localization from source English;
2. missing fail-fast barrier;
3. missing request or raw-response persistence;
4. overwritten retry history;
5. character-map ownership defects;
6. stale artifact reuse;
7. missing provenance;
8. race conditions;
9. partial writes;
10. generic path-based APIs;
11. weak validation;
12. inconsistent CLI behavior.

## 4. Artifact classification

Create a table with:

- artifact name;
- current source;
- recommended source;
- artifact scope;
- current storage location;
- recommended storage location;
- request-history location;
- response-history location;
- direct dependency;
- invalidation trigger;
- may localization read it;
- may localization modify it;
- regeneration policy.

## 5. Request and response persistence design

Document:

- folder structure;
- generation-run identity;
- request-attempt identity;
- file naming;
- schemas;
- request serialization;
- prompt serialization;
- raw-response serialization;
- normalized-response serialization;
- validation serialization;
- secret redaction;
- atomic persistence;
- retry handling;
- batch handling;
- retention policy;
- archival strategy;
- manifest linkage.

## 6. Target architecture

Describe:

- canonical artifact;
- typed domain model;
- orchestration service;
- dependency graph;
- canonical readiness barrier;
- validation stages;
- storage layer;
- generation-history service;
- manifest service;
- shared-artifact ownership;
- concurrency control;
- failure propagation;
- CLI exit behavior;
- batch and synchronous compatibility.

## 7. Implementation tasks

Create actionable tasks in dependency order.

Use IDs:

- STORY-001
- STORY-002
- STORY-003
- and so on.

Each task must include:

- title;
- priority;
- estimated complexity: small, medium, or large;
- problem statement;
- implementation scope;
- likely files or modules;
- technical design;
- dependencies;
- acceptance criteria;
- unit tests;
- integration tests;
- migration concerns;
- backward-compatibility concerns;
- observability requirements;
- definition of done.

Do not create vague tasks such as “refactor workflow”.

Each task must be independently implementable and verifiable.

## 8. Test plan

Include:

- unit tests;
- type-level tests;
- prompt-selection tests;
- prompt-persistence tests;
- raw-response-persistence tests;
- validation tests;
- orchestration tests;
- filesystem integration tests;
- manifest tests;
- generation-history tests;
- CLI tests;
- batch workflow tests;
- retry tests;
- stale-artifact tests;
- concurrency tests;
- atomic-write failure tests;
- secret-redaction tests;
- migration tests;
- end-to-end tests with mocked model providers.

## 9. Migration plan

Inspect existing episodes and recommend how to handle:

- source English only;
- optimized English without provenance;
- localized files with unknown lineage;
- story outputs without request history;
- story outputs without raw response history;
- character maps under language folders;
- duplicate character maps;
- manifests without hashes;
- stale localized stories;
- missing optimized English;
- partial outputs;
- abandoned temporary files;
- old retry responses that were overwritten;
- batch indexes without custom-ID mappings.

Do not trust existing artifacts merely because they exist.

Recommend audit commands equivalent to:

```bash
stories audit-lineage --episode <slug>
stories audit-lineage --all
stories audit-artifacts --episode <slug>
stories audit-history --episode <slug>
stories history verify --episode <slug>
stories repair-manifest --episode <slug> --dry-run
stories migrate-shared-artifacts --episode <slug> --dry-run
stories migrate-generation-history --episode <slug> --dry-run
```

The audit commands must not modify files.

Repair and migration commands should support `--dry-run`.

## 10. Recommended implementation sequence

Group tasks into phases.

### Phase 1 — Correctness and fail-fast enforcement

- canonical artifact type;
- optimization validation;
- fail-fast barrier;
- correct CLI exit codes;
- prevention of source-story fallbacks.

### Phase 2 — Request and response audit history

- generation-run IDs;
- attempt IDs;
- exact rendered prompt persistence;
- raw response persistence;
- retry history;
- secret redaction;
- generation-history manifests.

### Phase 3 — Canonical lineage and manifests

- content hashing;
- rendered prompt hashing;
- provenance;
- stale detection;
- episode manifest schema changes;
- migration support.

### Phase 4 — Shared artifacts and character-map ownership

- shared-artifact registry;
- character-map single ownership;
- shared folder path enforcement;
- canonical facts and timeline.

### Phase 5 — Atomicity and concurrency

- atomic writes;
- per-episode locks;
- manifest serialization;
- generation-history concurrency;
- parallel downstream execution.

### Phase 6 — Cleanup and compatibility

- remove deprecated APIs;
- adapters for legacy commands;
- documentation;
- migration tooling;
- archival tooling;
- dead-code removal.

## Mandatory tasks to include

At minimum, create and fully specify the following tasks.

### STORY-001 — Introduce semantic story artifact types

Create separate typed representations for:

- source English story;
- validated optimized English story;
- localized full story;
- localized short story;
- shared artifact;
- generation result;
- validation failure.

Acceptance criteria:

- downstream generators cannot accept the source English type;
- unsupported state transitions fail at compile time where practical;
- no generic arbitrary input path is accepted by public generation APIs;
- type handling is exhaustive.

### STORY-002 — Centralize canonical workflow orchestration

Create one authoritative orchestration service that enforces the complete dependency order.

Acceptance criteria:

- all CLI and batch entry points use it;
- no alternate path bypasses optimization;
- low-level generators do not resolve arbitrary source files;
- the orchestration service returns a structured result.

### STORY-003 — Add optimization validation and canonical promotion

Validate optimized English output before promoting it to canonical status.

Acceptance criteria:

- empty, malformed, refused, partial, summary-only, or semantically incomplete output fails;
- failed output is not committed to the canonical final path;
- validation results are typed and logged;
- only validated output can create `OptimizedEnglishStory`.

### STORY-004 — Enforce fail-fast canonical barrier

Block every downstream task until canonical optimization succeeds.

Acceptance criteria:

- failed optimization returns a non-zero exit code;
- no short stories are generated;
- no localizations are generated;
- no character map is generated;
- no shared artifacts are generated;
- no output is marked successful;
- queued jobs are blocked or cancelled.

### STORY-005 — Enforce localized full-story lineage

Make every localized full story consume the canonical optimized English artifact.

Acceptance criteria:

- source English cannot be passed;
- direct source-file localization is removed or rejected;
- source hash is stored;
- stale outputs are detected;
- supported CLIs route through canonical orchestration.

### STORY-006 — Enforce localized short-story lineage

Generate localized shorts directly from canonical optimized English.

Acceptance criteria:

- localized short generation requires `OptimizedEnglishStory`;
- character map and canonical facts are passed as read-only context;
- localized full prose is not the authoritative source;
- direct dependency hash is stored;
- output validation verifies the canonical story invariants.

### STORY-007 — Restrict English short generation

Ensure English shorts are also derived only from canonical optimized English.

Acceptance criteria:

- English short generation cannot use source English;
- direct dependency hash is stored;
- stale English short artifacts are invalidated.

### STORY-008 — Establish character-map single ownership

Move character-map generation into the canonical-English stage.

Acceptance criteria:

- only optimized English may generate it;
- localization jobs are read-only consumers;
- short jobs are read-only consumers;
- it is stored only in the shared folder;
- stable IDs are used;
- provenance is recorded;
- stale maps are regenerated;
- writes are concurrency-safe;
- its exact request and raw response are persisted.

### STORY-009 — Add canonical source-fact preservation validation

Extract important source invariants and compare them with optimized output.

Acceptance criteria:

- critical lost or contradicted facts fail optimization validation;
- source facts and optimized canon remain separate;
- downstream jobs consume optimized canon;
- validation results are persisted;
- extraction requests and responses are persisted.

### STORY-010 — Introduce shared-artifact registry and policy

Centralize artifact ownership, source, storage, invalidation, and localization permissions.

Acceptance criteria:

- every shared artifact has a declared source;
- storage paths are centralized;
- language jobs cannot overwrite canonical artifacts;
- schema and prompt versions drive invalidation.

### STORY-011 — Add content hashes and provenance

Add direct dependency lineage to all generated artifacts.

Acceptance criteria:

- every derived artifact records its direct source hash;
- stale detection works;
- unknown-lineage artifacts are not treated as validated;
- manifest changes are backward compatible or migrated.

### STORY-012 — Introduce generation-run and attempt identities

Create stable identifiers for full workflow runs and individual provider attempts.

Acceptance criteria:

- every request has a generation-run ID;
- every provider call has a unique attempt ID;
- retries never reuse attempt IDs;
- all artifacts and history records can be linked to their attempt.

### STORY-013 — Persist exact rendered story prompts

Persist every effective story-related model request before provider invocation.

Acceptance criteria:

- exact system prompt is persisted;
- exact user prompt is persisted;
- request metadata is persisted;
- prompt template and version are recorded;
- rendered prompt hash is recorded;
- secrets are redacted;
- request files are immutable after submission.

### STORY-014 — Persist raw and normalized model responses

Persist every raw model response before parsing or validation.

Acceptance criteria:

- raw provider output is retained;
- normalized output is stored separately;
- provider errors are persisted;
- validation failures do not delete raw responses;
- response hashes are recorded;
- retries create separate response files.

### STORY-015 — Add generation-history folder and manifest

Create one consistent per-episode generation-history structure.

Acceptance criteria:

- all story operations use the same history resolver;
- runs are separated;
- attempts are immutable;
- the run manifest links every request, response, validation, and final artifact;
- history is not mixed with final canonical output.

### STORY-016 — Add atomic artifact and history persistence

Implement safe temporary writes and atomic commit behavior.

Acceptance criteria:

- no partially written final files;
- no partially written request or response history files;
- manifests update only after commit;
- temporary files are cleaned;
- failure scenarios are tested.

### STORY-017 — Add per-episode concurrency protection

Protect canonical and shared-artifact generation.

Acceptance criteria:

- duplicate canonical generation is prevented;
- duplicate character-map generation is prevented;
- localization may run concurrently after readiness;
- stale locks are handled;
- lock errors are observable;
- concurrent attempts cannot overwrite history.

### STORY-018 — Centralize manifest mutations

Create one service for reading, validating, and updating manifests.

Acceptance criteria:

- no scattered direct JSON writes;
- writes are serialized or compare-and-swap protected;
- manifest validation exists;
- concurrent updates do not lose data.

### STORY-019 — Add batch request and response lineage

Persist and reconcile batch requests and delayed responses.

Acceptance criteria:

- batch IDs are persisted;
- custom IDs map to attempts;
- downloaded result files are retained;
- every result maps to exactly one request;
- failed items preserve errors;
- batch completion still passes validation and canonical barriers.

### STORY-020 — Add history audit and retention tooling

Add non-destructive history inspection and explicit archival tools.

Acceptance criteria:

- history can be listed and verified;
- missing request or response files are reported;
- orphaned attempts are reported;
- archival supports `--dry-run`;
- no history is deleted automatically;
- canonical provenance remains intact after archival.

### STORY-021 — Add audit and migration tooling

Add non-destructive audit commands and explicit migration commands.

Acceptance criteria:

- lineage can be audited per episode or globally;
- unknown-lineage files are reported;
- outputs without request history are reported;
- misplaced character maps are reported;
- dry-run output is clear;
- no content is overwritten in audit mode.

### STORY-022 — Add workflow-level regression tests

Add tests proving all canonical and auditability invariants.

Required scenarios:

1. successful optimization unlocks downstream generation;
2. provider failure aborts;
3. empty response aborts;
4. refusal aborts;
5. malformed optimized output aborts;
6. semantic validation failure aborts;
7. localized full consumes optimized English;
8. localized short consumes optimized English;
9. English short consumes optimized English;
10. original source cannot be passed to downstream APIs;
11. character map is generated once from optimized English;
12. localization cannot overwrite the character map;
13. changed optimized English invalidates localizations;
14. changed optimized English invalidates shorts;
15. changed optimized English invalidates the character map;
16. valid existing artifacts are reused;
17. unknown-lineage artifacts are not reused;
18. failed writes leave no final partial artifact;
19. concurrent localization jobs do not corrupt the manifest;
20. concurrent shared-artifact generation is serialized;
21. CLI exits non-zero after canonical failure;
22. batch execution blocks dependent jobs after canonical failure;
23. exact rendered request is persisted before invocation;
24. raw response is persisted before normalization;
25. failed provider responses are persisted;
26. validation failures retain raw responses;
27. retries create immutable separate attempt folders;
28. prompt or response files cannot be overwritten by concurrent jobs;
29. secrets are redacted from persisted request metadata;
30. every final story artifact links to one exact request and response;
31. missing generation history causes audit failure;
32. delayed batch responses map to the correct request attempt.

## Review quality requirements

- Inspect the repository before reaching conclusions.
- Cite concrete paths and symbols.
- Do not infer behavior only from filenames.
- Trace actual call chains.
- Clearly identify where behavior is confirmed versus suspected.
- Check both synchronous and batch implementations.
- Check retry and resume paths.
- Check existing tests before proposing new abstractions.
- Preserve current prompts where they are correct.
- Do not replace the currently wired optimization prompt without evidence.
- Do not remove synchronous generation.
- Do not introduce a second competing manifest system.
- Preserve backward compatibility where practical.
- Do not preserve any behavior that permits downstream generation from the unoptimized source.
- Do not preserve behavior that discards or overwrites story prompt requests or raw model responses.
- Prefer incremental, testable tasks over a large rewrite.
- Recommend removal of deprecated bypass APIs only after callers have migrated.

## Final output

At the end of the review, provide:

1. The five most serious current risks.
2. The confirmed current source used by each story-generation path.
3. Whether optimization failure currently aborts safely.
4. Whether the character map currently has a single canonical owner.
5. Whether exact prompt requests and raw responses are currently persisted.
6. Whether retries preserve immutable request and response history.
7. The final recommended artifact-sharing model.
8. The recommended generation-history folder structure.
9. The target canonical workflow.
10. The ordered task list.
11. The recommended first implementation task.
12. Any blockers or unknowns that require repository-specific decisions.

Do not begin the implementation in this task.

Create the review, architecture plan, task breakdown, migration plan, request-and-response persistence design, retention recommendation, and test plan so they can be implemented in a subsequent Codex session.
