First inspect the repository and create a phased implementation plan with concrete tasks, dependencies, affected files, migration risks, and validation criteria. Save the plan to docs/plans/story-localization-batch-pipeline.md. Do not modify production code during this first step.

You are working inside an existing TypeScript/Node.js repository containing a multilingual horror-story production pipeline.

The repository already contains implementation related to:

- English horror-story discovery;
- multilingual localization;
- English and localized YouTube Shorts;
- structured OpenAI responses;
- canonical story facts;
- a maximum of three main characters;
- character maps;
- character reference prompts;
- thumbnail concepts;
- thumbnail image prompts;
- OpenAI image generation;
- cost tracking;
- caching;
- validation;
- CLI commands.

Inspect the complete repository before modifying anything.

Extend and adapt the existing implementation.

Do not create parallel translation, character, visual, OpenAI client, logging, cache, cost, batch, manifest, index, or CLI systems when existing modules can be reused or refactored.

The primary changes in this task are:

1. use the OpenAI Batch API as the default production strategy for text-content preparation;
2. persist all batch identifiers and lifecycle metadata locally;
3. maintain a central batch index for easy lookup;
4. support listing, finding, importing, retrying, and repairing batches after the CLI or machine has restarted;
5. send only compact story input to runtime model calls;
6. preserve the existing hard maximum of three main characters;
7. keep actual image generation separate and on demand.

Do not stop after creating an implementation plan.

Implement the workflow, integrate it with the existing pipeline, add tests, run formatting, linting, strict type checking, and all tests, then report the final results.

# Fixed directories

Canonical English source stories are stored in:

```text
./content/dark-truth-episodes-multilingual-production-pack
```

Generated English and localized content is stored in:

```text
./content-ideas/content/dark-truth-episodes
```

Resolve both paths relative to the repository root.

Use:

```ts
export const DEFAULT_SOURCE_DIRECTORY =
  "./content/dark-truth-episodes-multilingual-production-pack";

export const DEFAULT_OUTPUT_DIRECTORY =
  "./content-ideas/content/dark-truth-episodes";
```

# Canonical source rule

Always use the English full story as the sole canonical source.

Only files matching this pattern may be selected as source files:

```text
*-en-full.md
```

Never use these as canonical sources:

```text
*-en-short.md
*-de-full.md
*-de-short.md
*-es-full.md
*-es-short.md
*-fr-full.md
*-fr-short.md
*-pt-full.md
*-pt-short.md
```

Never:

- translate a translation;
- generate a Short from another Short;
- extract canonical characters from translated content;
- extract canonical visual facts from translated content;
- derive one language from another language.

# Main production outputs

For each English full story:

1. copy the English full story to the production output;
2. generate an optimized English YouTube Short;
3. generate a German full story and Short;
4. generate a Spanish full story and Short;
5. generate a French full story and Short;
6. generate a Brazilian Portuguese full story and Short;
7. generate localized metadata with each language package;
8. identify no more than three main recurring characters;
9. update the existing canonical character map;
10. generate character reference-image prompts;
11. generate one canonical full-thumbnail concept;
12. generate one canonical Short-thumbnail concept;
13. generate localized thumbnail prompt variants;
14. save manifests, hashes, token usage, costs, and validation results;
15. generate actual images only when explicitly requested.

# Batch production strategy

Use the OpenAI Batch API as the default mode for production text generation.

Use one independent batch request item for each episode-operation-language combination.

For one episode, the normal localization batch should contain:

```text
episode-002 / English Short
episode-002 / German full + Short + metadata
episode-002 / Spanish full + Short + metadata
episode-002 / French full + Short + metadata
episode-002 / Portuguese full + Short + metadata
```

Do not combine all languages into one response.

Each target language must remain independently:

- addressable;
- validated;
- cached;
- retried;
- repaired;
- persisted;
- costed;
- reported.

A failure in one language must not invalidate successful languages.

# Batch versus synchronous modes

Support:

```ts
type ProcessingMode = "batch" | "sync";
```

Default:

```text
batch
```

Use batch mode for:

- normal production localization;
- multi-episode runs;
- multi-language runs;
- English Short generation;
- canonical-fact extraction when needed;
- character analysis when needed;
- visual analysis when needed;
- non-urgent bulk regeneration.

Use synchronous mode for:

- development;
- debugging;
- one urgent story;
- one failed language;
- targeted validation repair;
- interactive testing;
- explicitly requested immediate generation.

Do not silently fall back from batch to synchronous mode because a batch failed.

A fallback to synchronous processing must require:

```text
--fallback-to-sync
```

Default:

```text
false
```

Log every synchronous fallback and its expected higher cost.

# Compact model input

Parse complete Markdown locally.

Do not send the complete Markdown file to normal OpenAI requests.

Send only:

- narration;
- episode number;
- primary title;
- source title where relevant;
- suggested thumbnail hook;
- content disclosure;
- sound motif where relevant;
- compact canonical story facts;
- compact character summaries where relevant;
- operation-specific instructions.

Do not repeatedly send:

- Markdown headings;
- Markdown labels;
- separator lines;
- full narrator boilerplate;
- generic audio instructions;
- existing SEO descriptions;
- existing tags;
- existing hashtags;
- generic visual direction;
- output paths;
- CLI documentation;
- repository architecture;
- implementation instructions;
- complete manifests;
- complete character-map Markdown;
- previous model responses;
- translated stories.

# Source parsing

Extend or implement a tolerant local Markdown parser.

Use:

```ts
interface ParsedEnglishStory {
  readonly sourcePath: string;
  readonly sourceHash: string;

  readonly episodeNumber: string;
  readonly filenameSlug: string;

  readonly primaryTitle: string;
  readonly sourceTitle?: string;

  readonly narration: string;

  readonly soundMotif?: string;
  readonly suggestedThumbnailText?: string;
  readonly contentDisclosure?: string;

  readonly targetNarrationWpm?: {
    readonly min?: number;
    readonly max?: number;
    readonly target: number;
  };

  readonly existingMetadata: {
    readonly seoDescription?: string;
    readonly tags: readonly string[];
    readonly hashtags: readonly string[];
    readonly visualDirection?: string;
  };
}
```

The parser must:

- preserve narration content;
- preserve dialogue;
- preserve meaningful capitalization;
- preserve written clues;
- preserve timestamps;
- preserve Unicode;
- normalize line wrapping only where safe;
- reject missing narration;
- reject missing episode numbers;
- reject malformed source files clearly.

# Compact runtime DTO

Never pass the complete parsed Markdown object to an OpenAI client.

Use:

```ts
interface CompactStorySource {
  readonly episodeNumber: string;
  readonly primaryTitle: string;
  readonly sourceTitle?: string;

  readonly narration: string;

  readonly thumbnailHook?: string;
  readonly contentDisclosure?: string;
  readonly soundMotif?: string;

  readonly canonicalFacts: CompactCanonicalStoryFacts;
}
```

Use:

```ts
interface CompactCanonicalStoryFacts {
  readonly characters: readonly {
    readonly id: string;
    readonly name: string;
    readonly role: string;
    readonly relationship?: string;
  }[];

  readonly setting?: string;
  readonly criticalObjects: readonly string[];
  readonly criticalEvents: readonly string[];
  readonly writtenMessages: readonly string[];

  readonly centralThreat: string;
  readonly primaryReveal: string;
  readonly finalConsequence: string;
}
```

Canonical fact values should be concise.

Do not store repeated explanatory prose in compact runtime facts.

# Supported languages

Use:

```ts
type LanguageCode = "en" | "de" | "es" | "fr" | "pt";
```

Language rules:

## English

- Copy the English full story unchanged.
- Generate only an optimized English Short.
- Use clear international English.
- Preserve plot, clues, reveal, and ending.

## German

- Use natural standard German.
- Avoid bureaucratic vocabulary.
- Avoid deeply nested clauses.
- Use simple spoken language.
- Use idiomatic titles and hooks.

## Spanish

- Use neutral international Spanish.
- Avoid narrow regional slang.
- Keep narration natural for Spain and Latin America.
- Use simple spoken sentences.

## French

- Use natural international French.
- Avoid academic and overly literary phrasing.
- Use direct spoken narration.
- Preserve tension through rhythm and clarity.

## Portuguese

- Use Brazilian Portuguese.
- Use locale `pt-BR`.
- Avoid narrow slang.
- Keep the architecture open for future `pt-PT` support.

# Translation persona

Use this compact production persona:

“You are a senior multilingual horror writer, localization editor, and YouTube retention specialist.

Adapt fictional horror narration so it sounds originally written in the target language.

Preserve characters, relationships, chronology, critical objects, clues, written messages, central threat, reveal, and ending.

Use simple natural spoken language, an immediate hook, steady escalation, and a strong final line.

Remove generic filler that does not advance the story.

Do not add new events, characters, victims, monsters, explanations, or graphic gore.”

Do not place repository implementation details inside runtime prompts.

# Translation output strategy

For each non-English language, one batch item must generate:

- localized full narration;
- localized title;
- localized source title;
- localized sound motif;
- localized thumbnail text;
- localized content disclosure;
- localized SEO description;
- localized tags;
- localized hashtags;
- story-specific visual direction;
- localized Short;
- localized Short metadata;
- preservation checklist;
- diagnostics.

For English, one batch item must generate:

- optimized English Short;
- English Short metadata;
- preservation checklist;
- diagnostics.

Do not create separate calls for:

- titles;
- SEO descriptions;
- tags;
- hashtags;
- thumbnail text;
- Short metadata;
- visual direction.

# Story optimization

Default adaptation mode:

```text
retention-optimized
```

Support:

```ts
type AdaptationMode = "faithful" | "retention-optimized";
```

In `retention-optimized` mode:

- preserve every plot-critical fact;
- remove generic template filler;
- improve the opening hook;
- reduce repetition;
- strengthen transitions;
- use simpler language;
- preserve chronology;
- preserve clues;
- preserve the reveal;
- preserve the ending;
- do not invent replacement events.

# Short requirements

Generate one Short per language.

Target duration:

```text
55–65 seconds
```

Use:

```ts
export const SHORT_WORD_RANGES = {
  en: { min: 160, target: 175, max: 190 },
  de: { min: 145, target: 165, max: 180 },
  es: { min: 160, target: 178, max: 195 },
  fr: { min: 155, target: 172, max: 190 },
  pt: { min: 160, target: 178, max: 195 },
} as const;
```

Every Short must:

- begin immediately;
- establish the protagonist quickly;
- establish the abnormal threat quickly;
- preserve causal coherence;
- retain the defining reveal;
- retain the disturbing final consequence;
- avoid greetings;
- avoid channel introductions;
- avoid calls to action;
- avoid generic documentary commentary;
- avoid metadata inside narration;
- use simple spoken language.

# Deterministic production templates

Render fixed Markdown and production boilerplate locally.

Do not spend model tokens generating predictable repeated text.

Create localized templates for:

- Markdown headings;
- production instruction headings;
- “do not narrate headings or metadata”;
- narrator continuity;
- narration pace;
- format labels;
- aspect ratios;
- metadata field labels;
- generic visual guidance;
- full and Short output structures.

Use:

```ts
interface LocalizedProductionTemplate {
  readonly audioSectionHeading: string;
  readonly narrationSectionHeading: string;
  readonly metadataSectionHeading: string;

  readonly doNotNarrateInstruction: string;
  readonly sameNarratorInstruction: string;
  readonly restrainedToneInstruction: string;
  readonly targetPaceInstruction: string;

  readonly fullFormatLabel: string;
  readonly shortFormatLabel: string;
}
```

Generate only story-specific content through OpenAI.

# Structured response schema

Use structured JSON output and Zod validation.

Do not request Markdown directly from the model.

Use or extend:

```ts
const LocalizedStoryPackageSchema = z.object({
  language: z.enum(["de", "es", "fr", "pt"]),

  full: z.object({
    title: z.string().min(1),
    sourceTitle: z.string().min(1).optional(),
    narrationParagraphs: z.array(z.string().min(1)).min(3),

    soundMotif: z.string().min(1).optional(),
    thumbnailText: z.string().min(1).max(50),
    contentDisclosure: z.string().min(1),
    seoDescription: z.string().min(1),

    tags: z.array(z.string().min(1)).min(3).max(20),
    hashtags: z.array(z.string().regex(/^#/)).min(1).max(8),

    storySpecificVisualDirection: z.string().min(1),
  }),

  short: z.object({
    title: z.string().min(1),
    narrationParagraphs: z.array(z.string().min(1)).min(1),
    thumbnailText: z.string().min(1).max(50),
    description: z.string().min(1),
    hashtags: z.array(z.string().regex(/^#/)).min(1).max(8),
  }),

  preservationChecklist: z.object({
    charactersPreserved: z.boolean(),
    relationshipsPreserved: z.boolean(),
    chronologyPreserved: z.boolean(),
    criticalObjectsPreserved: z.boolean(),
    writtenMessagesPreserved: z.boolean(),
    primaryRevealPreserved: z.boolean(),
    endingPreserved: z.boolean(),
    noNewPlotElementsAdded: z.boolean(),
  }),

  diagnostics: z.object({
    fullWordCount: z.number().int().nonnegative(),
    shortWordCount: z.number().int().nonnegative(),
    removedGenericFiller: z.array(z.string()),
    adaptationNotes: z.array(z.string()),
  }),
});
```

Create a separate schema for English Short results.

# Batch operation model

Use:

```ts
type BatchOperation =
  | "canonical-facts"
  | "english-short"
  | "localization"
  | "character-analysis"
  | "visual-analysis"
  | "repair";
```

Use:

```ts
interface StoryBatchItem<TBody extends object = object> {
  readonly customId: string;
  readonly method: "POST";
  readonly url: "/v1/responses";
  readonly body: TBody;

  readonly metadata: {
    readonly episodeNumber: string;
    readonly sourceHash: string;
    readonly operation: BatchOperation;
    readonly language?: LanguageCode;
    readonly promptVersion: string;
    readonly configurationHash: string;
  };
}
```

The serialized JSONL line must contain only supported fields:

```ts
interface OpenAIBatchRequestLine {
  readonly custom_id: string;
  readonly method: "POST";
  readonly url: "/v1/responses";
  readonly body: Record<string, unknown>;
}
```

Keep local metadata inside the local manifest and index.

# Deterministic custom IDs

Every batch request must have a unique deterministic `custom_id`.

Use:

```text
dte:{episode}:{operation}:{language-or-none}:{sourceHashPrefix}:{configHashPrefix}
```

Examples:

```text
dte:002:english-short:en:a91f06d2:21a8f94c
dte:002:localization:de:a91f06d2:1fb82c93
dte:002:localization:es:a91f06d2:9349a8c1
dte:002:localization:fr:a91f06d2:5c2dd0f8
dte:002:localization:pt:a91f06d2:7a19d3bf
```

Custom IDs must:

- be unique within a batch;
- remain stable for identical source and configuration;
- contain no secrets;
- be filesystem-safe;
- not depend on output ordering.

When force-regenerating, add a deterministic attempt suffix:

```text
dte:002:localization:de:a91f06d2:1fb82c93:r2
```

# Batch grouping

Group compatible items by:

- endpoint;
- model;
- schema compatibility where necessary;
- dependency stage.

Recommended groups:

```text
canonical-facts batch
localization batch
character-analysis batch
visual-analysis batch
repair batch
```

Prefer one localization batch containing many episodes and languages when they use the same model and endpoint.

Do not create one remote batch for every language unless requested.

# Batch storage root

Store all batch-related local files under:

```text
./content-ideas/content/dark-truth-episodes/.batch
```

Use:

```text
.batch/
  batch-index.json

  pending/
  submitted/
  completed/
  failed/
  expired/
  cancelled/

  inputs/
  results/
  errors/
  manifests/
  locks/
  reports/
  quarantine/
```

Recommended artifacts:

```text
inputs/batch-{localBatchId}.jsonl
manifests/batch-{localBatchId}.manifest.json
results/batch-{localBatchId}.output.jsonl
errors/batch-{localBatchId}.errors.jsonl
reports/batch-{localBatchId}.summary.json
```

# Central batch index

Maintain one central index:

```text
./content-ideas/content/dark-truth-episodes/.batch/batch-index.json
```

The index exists to allow users and commands to quickly:

- list all known batches;
- find a batch by local ID;
- find a batch by OpenAI batch ID;
- find batches for an episode;
- find pending batches;
- find completed but unimported batches;
- find failed or expired batches;
- find the latest batch;
- locate the correct manifest;
- resume after a machine restart;
- import results without manually locating files.

Use:

```ts
type BatchIndexStatus =
  | "prepared"
  | "submitted"
  | "validating"
  | "in_progress"
  | "finalizing"
  | "completed"
  | "partially_completed"
  | "failed"
  | "expired"
  | "cancelling"
  | "cancelled"
  | "imported"
  | "imported_with_failures";
```

Use:

```ts
interface BatchIndexEntry {
  readonly localBatchId: string;
  readonly openAIBatchId?: string;

  readonly rootLocalBatchId: string;
  readonly parentLocalBatchId?: string;
  readonly retryNumber: number;

  readonly status: BatchIndexStatus;

  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt?: string;
  readonly completedAt?: string;
  readonly importedAt?: string;

  readonly model: string;
  readonly endpoint: "/v1/responses";
  readonly completionWindow: "24h";

  readonly operations: readonly BatchOperation[];
  readonly episodeNumbers: readonly string[];
  readonly languages: readonly LanguageCode[];

  readonly itemCount: number;
  readonly completedItemCount: number;
  readonly failedItemCount: number;
  readonly persistedItemCount: number;

  readonly inputFilePath: string;
  readonly manifestPath: string;
  readonly resultFilePath?: string;
  readonly errorFilePath?: string;
  readonly reportFilePath?: string;

  readonly openAIInputFileId?: string;
  readonly outputFileId?: string;
  readonly errorFileId?: string;

  readonly sourceHashPrefixes: readonly string[];

  readonly imported: boolean;
  readonly requiresImport: boolean;
  readonly hasRetryableFailures: boolean;

  readonly estimatedInputTokens?: number;
  readonly actualInputTokens?: number;
  readonly actualOutputTokens?: number;
  readonly estimatedCostUsd?: number;

  readonly lastError?: {
    readonly code?: string;
    readonly message: string;
    readonly occurredAt: string;
  };
}
```

Use:

```ts
interface BatchIndexFile {
  readonly schemaVersion: string;
  readonly createdAt: string;
  readonly updatedAt: string;

  readonly entries: readonly BatchIndexEntry[];
}
```

# Batch index invariants

The index must guarantee:

- unique `localBatchId`;
- unique non-empty `openAIBatchId`;
- every entry references an existing manifest unless explicitly marked broken;
- manifest and index status remain synchronized;
- all paths are repository-relative where practical;
- all timestamps use ISO 8601;
- arrays are de-duplicated and sorted deterministically;
- no API secrets are stored;
- entries are never matched by array position;
- imports are idempotent;
- status transitions are validated.

The index is a lookup accelerator.

The manifest remains the authoritative detailed record for one batch.

If the index and manifest disagree:

1. read the manifest;
2. validate it;
3. treat the manifest as authoritative;
4. repair the index entry;
5. log the discrepancy;
6. never silently discard manifest data.

# Batch index service

Implement:

```ts
interface BatchIndexService {
  initialize(): Promise<void>;

  list(filter?: BatchIndexFilter): Promise<readonly BatchIndexEntry[]>;

  getByLocalBatchId(localBatchId: string): Promise<BatchIndexEntry | undefined>;

  getByOpenAIBatchId(
    openAIBatchId: string
  ): Promise<BatchIndexEntry | undefined>;

  getLatest(filter?: BatchIndexFilter): Promise<BatchIndexEntry | undefined>;

  findByEpisode(
    episodeNumberOrSlug: string
  ): Promise<readonly BatchIndexEntry[]>;

  upsert(entry: BatchIndexEntry): Promise<void>;

  update(
    localBatchId: string,
    patch: BatchIndexEntryPatch
  ): Promise<BatchIndexEntry>;

  remove(localBatchId: string): Promise<void>;

  rebuild(): Promise<BatchIndexRepairReport>;

  verify(): Promise<BatchIndexVerificationReport>;
}
```

Use:

```ts
interface BatchIndexFilter {
  readonly statuses?: readonly BatchIndexStatus[];
  readonly episodeNumbers?: readonly string[];
  readonly languages?: readonly LanguageCode[];
  readonly operations?: readonly BatchOperation[];
  readonly model?: string;
  readonly imported?: boolean;
  readonly requiresImport?: boolean;
  readonly hasRetryableFailures?: boolean;
  readonly createdAfter?: string;
  readonly createdBefore?: string;
}
```

# Batch index atomicity

All index writes must be atomic.

Use:

1. acquire index lock;
2. read and validate current index;
3. apply deterministic update;
4. write temporary file;
5. flush and close;
6. rename over final index;
7. release lock.

Do not update the index through unprotected read-modify-write operations.

Use a dedicated lock:

```text
.batch/locks/batch-index.lock
```

Handle stale locks safely.

Do not delete an active lock merely because it exists.

Use an existing locking library where available, or implement a bounded stale-lock policy containing:

- process ID where available;
- hostname;
- created timestamp;
- configurable stale threshold;
- lock owner identifier.

# Index update lifecycle

Update the index after every durable state change.

## During preparation

Create an entry with:

```text
status=prepared
openAIBatchId=undefined
requiresImport=false
```

## After upload

Update:

```text
openAIInputFileId
updatedAt
```

## After submission

Update:

```text
openAIBatchId
status=submitted
submittedAt
requiresImport=false
```

## During status refresh

Update:

```text
status
completedItemCount
failedItemCount
outputFileId
errorFileId
completedAt
requiresImport
```

When remote status is `completed`:

```text
requiresImport=true
```

unless the results have already been imported.

## After import

Update:

```text
status=imported
or
status=imported_with_failures

imported=true
requiresImport=false
importedAt
persistedItemCount
failedItemCount
hasRetryableFailures
resultFilePath
errorFilePath
reportFilePath
```

## After retry planning

Create a new child index entry with:

```text
rootLocalBatchId=<root>
parentLocalBatchId=<failed batch>
retryNumber=<parent retry number + 1>
```

Do not mutate the historical parent entry into the retry batch.

# Index repair and rebuild

Implement index repair because users may:

- move files;
- restore files from backup;
- delete an index accidentally;
- interrupt writes;
- upgrade from an earlier implementation;
- copy manifests from another machine.

Support:

```bash
npm run stories:batches -- rebuild-index
```

The rebuild must:

1. scan `.batch/manifests`;
2. parse every manifest;
3. validate every manifest;
4. reconstruct index entries;
5. detect duplicate local IDs;
6. detect duplicate OpenAI batch IDs;
7. detect missing files;
8. detect orphaned results;
9. detect orphaned errors;
10. preserve valid existing annotations where safe;
11. write a new atomic index;
12. produce a repair report.

Do not delete conflicting files automatically.

Place unknown or malformed artifacts in a report or quarantine listing.

Use:

```ts
interface BatchIndexRepairReport {
  readonly startedAt: string;
  readonly completedAt: string;

  readonly manifestsScanned: number;
  readonly entriesRebuilt: number;
  readonly entriesUpdated: number;
  readonly entriesUnchanged: number;

  readonly malformedManifests: readonly string[];
  readonly duplicateLocalBatchIds: readonly string[];
  readonly duplicateOpenAIBatchIds: readonly string[];
  readonly missingReferencedFiles: readonly string[];
  readonly orphanedResultFiles: readonly string[];
  readonly orphanedErrorFiles: readonly string[];

  readonly successful: boolean;
}
```

# Index verification

Support:

```bash
npm run stories:batches -- verify-index
```

Verification must check:

- index schema;
- duplicate IDs;
- missing manifests;
- manifest/index status mismatch;
- incorrect paths;
- missing input JSONL;
- missing result file after imported state;
- missing OpenAI batch ID after submitted state;
- impossible counts;
- imported entries marked `requiresImport=true`;
- completed unimported entries marked `requiresImport=false`;
- retry lineage cycles;
- references to nonexistent parents;
- invalid timestamps.

Verification must not modify files unless:

```text
--repair
```

is supplied.

# Local batch manifest

Use:

```ts
interface LocalBatchManifest {
  readonly schemaVersion: string;

  readonly localBatchId: string;
  readonly rootLocalBatchId: string;
  readonly parentLocalBatchId?: string;
  readonly retryNumber: number;

  readonly createdAt: string;
  readonly updatedAt: string;

  readonly mode: "batch";
  readonly endpoint: "/v1/responses";
  readonly model: string;
  readonly completionWindow: "24h";

  readonly inputFilePath: string;
  readonly inputFileHash: string;

  readonly openAIInputFileId?: string;
  readonly openAIBatchId?: string;

  readonly status:
    | "prepared"
    | "uploading"
    | "submitted"
    | "validating"
    | "in_progress"
    | "finalizing"
    | "completed"
    | "failed"
    | "expired"
    | "cancelling"
    | "cancelled"
    | "imported"
    | "imported_with_failures";

  readonly items: readonly LocalBatchManifestItem[];

  readonly outputFileId?: string;
  readonly errorFileId?: string;

  readonly resultFilePath?: string;
  readonly errorFilePath?: string;
  readonly reportFilePath?: string;

  readonly submittedAt?: string;
  readonly completedAt?: string;
  readonly importedAt?: string;

  readonly requestCounts?: {
    readonly total: number;
    readonly completed: number;
    readonly failed: number;
  };
}
```

Use:

```ts
interface LocalBatchManifestItem {
  readonly customId: string;

  readonly episodeNumber: string;
  readonly language?: LanguageCode;
  readonly operation: BatchOperation;

  readonly sourcePath: string;
  readonly sourceHash: string;

  readonly promptVersion: string;
  readonly configurationHash: string;

  readonly plannedOutputPaths: readonly string[];

  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens?: number;

  readonly status:
    | "planned"
    | "submitted"
    | "api-succeeded"
    | "api-failed"
    | "expired"
    | "schema-invalid"
    | "content-invalid"
    | "repair-required"
    | "persisted"
    | "skipped-cached";

  readonly resultImportedAt?: string;

  readonly usage?: {
    readonly inputTokens: number;
    readonly cachedInputTokens?: number;
    readonly outputTokens: number;
  };

  readonly error?: {
    readonly code?: string;
    readonly message: string;
  };
}
```

Write manifests atomically.

# Batch lookup resolution

Any command accepting:

```text
--batch <id>
```

must accept either:

- local batch ID;
- OpenAI batch ID.

Resolution order:

1. exact local batch ID in index;
2. exact OpenAI batch ID in index;
3. exact manifest filename match;
4. fail with a clear message.

Do not perform a broad fuzzy match for destructive operations.

For non-destructive lookup commands, allow a prefix only when it resolves to exactly one entry.

If multiple entries match, list the candidates and fail without choosing automatically.

# Batch lifecycle

Implement explicit stages.

## Prepare

```text
discover
→ parse
→ validate
→ build compact payloads
→ check caches
→ build JSONL
→ write local manifest
→ add index entry
```

No OpenAI request is made during preparation.

## Submit

```text
resolve batch through index
→ load prepared manifest
→ verify input hash
→ upload JSONL with purpose=batch
→ persist input file ID
→ create OpenAI batch
→ persist OpenAI batch ID
→ update manifest
→ update index
```

Use:

```text
completion_window=24h
```

## Status

```text
resolve through index
→ retrieve OpenAI batch
→ map remote status
→ update request counts
→ update manifest
→ update index
```

## Import

```text
resolve through index
→ refresh status
→ require completed or terminal partial state
→ download output file
→ download error file where present
→ save raw files locally
→ parse JSONL
→ match by custom_id
→ validate structured output
→ render Markdown
→ write outputs atomically
→ update caches and costs
→ update manifest item states
→ update manifest
→ update index
```

Do not rely on output order.

## Retry failed items

```text
resolve parent batch
→ collect only failed, expired, or validation-failed items
→ classify retry eligibility
→ prepare child JSONL
→ create child manifest
→ add child index entry
→ preserve lineage
→ do not resubmit successful items
```

## Cancel

```text
resolve through index
→ request cancellation
→ update manifest
→ update index
```

# No background waiting

Do not keep a CLI process running for up to 24 hours by default.

Default production behavior:

```text
prepare and submit
→ persist IDs
→ update index
→ print local batch ID
→ print OpenAI batch ID
→ print next commands
→ exit
```

Support:

```text
--wait
```

When supplied:

- poll at a configurable interval;
- persist every status transition;
- update the index after every poll;
- handle interruption safely;
- optionally import after completion.

Defaults:

```text
wait=false
auto-import=false
poll-interval-seconds=60
```

# Batch CLI commands

Preserve existing commands where possible.

## Prepare and submit production localization

```bash
npm run stories:localize -- \
  --all \
  --mode batch \
  --submit
```

## Prepare only

```bash
npm run stories:localize -- \
  --all \
  --prepare-batch
```

## One episode

```bash
npm run stories:localize -- \
  --episode 002 \
  --mode batch \
  --submit
```

## Selected languages

```bash
npm run stories:localize -- \
  --episode 002 \
  --languages de,es \
  --mode batch \
  --submit
```

## List all known batches

```bash
npm run stories:batches -- list
```

## Show latest batch

```bash
npm run stories:batches -- latest
```

## Show pending batches

```bash
npm run stories:batches -- pending
```

`pending` should include:

- prepared;
- submitted;
- validating;
- in progress;
- finalizing.

## Show completed batches requiring import

```bash
npm run stories:batches -- ready
```

Alias:

```bash
npm run stories:batches -- completed
```

The command should distinguish:

- completed and not imported;
- completed and imported.

## Show failed batches

```bash
npm run stories:batches -- failed
```

## Show expired batches

```bash
npm run stories:batches -- expired
```

## Find batches for an episode

```bash
npm run stories:batches -- \
  find \
  --episode 002
```

## Show batch details

```bash
npm run stories:batches -- \
  show \
  --batch <local-or-openai-batch-id>
```

## Refresh one batch status

```bash
npm run stories:batches -- \
  status \
  --batch <local-or-openai-batch-id>
```

## Refresh all active statuses

```bash
npm run stories:batches -- refresh
```

This must query only active submitted batches.

## Import one completed batch

```bash
npm run stories:batches -- \
  import \
  --batch <local-or-openai-batch-id>
```

## Import every completed unimported batch

```bash
npm run stories:batches -- import-ready
```

This command must:

- use the index;
- process only entries with `requiresImport=true`;
- acquire per-batch locks;
- continue when one import fails;
- print a summary.

## Retry failed items

```bash
npm run stories:batches -- \
  retry-failed \
  --batch <local-or-openai-batch-id>
```

## Cancel

```bash
npm run stories:batches -- \
  cancel \
  --batch <local-or-openai-batch-id>
```

## Verify index

```bash
npm run stories:batches -- verify-index
```

## Repair index

```bash
npm run stories:batches -- \
  verify-index \
  --repair
```

## Rebuild index

```bash
npm run stories:batches -- rebuild-index
```

## Synchronous development run

```bash
npm run stories:localize -- \
  --episode 002 \
  --languages de \
  --mode sync
```

# List output

Batch list commands should render a concise table:

```text
LOCAL ID             OPENAI ID       STATUS       CREATED       ITEMS  DONE  FAILED  IMPORT
batch-20260626-001   batch_abc123    completed    2026-06-26    50     49    1       ready
batch-20260626-002   batch_def456    in_progress  2026-06-26    20     12    0       no
```

Also support:

```text
--json
```

for machine-readable output.

# Latest batch behavior

`latest` must select by `createdAt`, not filename sorting.

Support filters:

```bash
npm run stories:batches -- \
  latest \
  --episode 002
```

```bash
npm run stories:batches -- \
  latest \
  --status completed
```

If no matching entry exists, return a clear no-result response rather than failing with an unrelated error.

# Batch CLI options

Support:

```text
--all
--episode <number-or-slug>
--file <english-full-story-path>

--languages <comma-separated-languages>
--include-english-short

--mode batch|sync
--prepare-batch
--submit
--wait
--auto-import
--poll-interval-seconds <number>
--fallback-to-sync

--batch <local-or-openai-batch-id>
--status <status>
--operation <operation>
--import-ready
--retry-failed
--cancel-batch

--source-dir <path>
--output-dir <path>

--adaptation-mode faithful|retention-optimized
--model <model>

--compact-model-input
--no-compact-model-input
--report-token-savings

--json
--repair
--force
--dry-run
--validate-only
--verbose
```

Defaults:

```text
mode=batch
languages=de,es,fr,pt
include-english-short=true
adaptation-mode=retention-optimized
compact-model-input=true
report-token-savings=true
submit=false
wait=false
auto-import=false
fallback-to-sync=false
poll-interval-seconds=60
```

Do not submit a batch implicitly merely because batch mode is selected.

Require:

```text
--submit
```

unless documented project configuration explicitly enables automatic submission.

# Batch API client

Reuse the existing official OpenAI Node.js SDK client.

Extend the existing abstraction with:

```ts
interface StoryBatchClient {
  uploadInputFile(inputPath: string): Promise<UploadedBatchFile>;

  createBatch(input: {
    readonly inputFileId: string;
    readonly endpoint: "/v1/responses";
    readonly completionWindow: "24h";
    readonly metadata?: Readonly<Record<string, string>>;
  }): Promise<RemoteBatch>;

  retrieveBatch(batchId: string): Promise<RemoteBatch>;

  cancelBatch(batchId: string): Promise<RemoteBatch>;

  downloadFile(fileId: string): Promise<string>;
}
```

Do not use shell-based `curl`.

Do not hardcode API keys.

Do not log secrets.

# JSONL writer

Implement a streaming or line-oriented JSONL writer.

Requirements:

- one valid JSON object per line;
- UTF-8 encoding;
- no trailing commas;
- no Markdown fences;
- deterministic ordering;
- unique `custom_id`;
- atomic file creation;
- file hash after completion;
- validation before upload.

Reject:

- malformed JSON;
- duplicate custom IDs;
- mixed unsupported endpoints;
- missing model;
- missing body;
- unsupported model;
- unsupported endpoint;
- empty batches.

# Batch limits

Implement configurable safety limits.

Defaults:

```ts
export const DEFAULT_BATCH_LIMITS = {
  maxRequestsPerBatch: 10_000,
  maxInputFileBytes: 150 * 1024 * 1024,
  maxEstimatedPromptTokensPerBatch: 5_000_000,
} as const;
```

When limits are exceeded:

- split deterministically;
- create separate manifests;
- create separate index entries;
- preserve item ordering;
- report the split;
- drop no items.

Split by:

1. model;
2. endpoint;
3. dependency stage;
4. request count;
5. estimated prompt tokens;
6. input file size.

# Result parsing

Output order is not guaranteed.

Map results by `custom_id`.

Use:

```ts
const BatchResultLineSchema = z.object({
  id: z.string().optional(),
  custom_id: z.string().min(1),

  response: z
    .object({
      status_code: z.number().int(),
      request_id: z.string().optional(),
      body: z.unknown(),
    })
    .nullable(),

  error: z
    .object({
      code: z.string().optional(),
      message: z.string(),
    })
    .nullable(),
});
```

Validate:

- every `custom_id` exists in the manifest;
- no result is imported twice;
- duplicate result IDs are rejected;
- unknown IDs are quarantined;
- missing items remain unresolved;
- response bodies use operation-specific schemas.

# Item state

Use:

```ts
type BatchItemState =
  | "planned"
  | "submitted"
  | "api-succeeded"
  | "api-failed"
  | "expired"
  | "schema-invalid"
  | "content-invalid"
  | "repair-required"
  | "persisted"
  | "skipped-cached";
```

An item reaches `persisted` only after:

- API success;
- schema parsing;
- deterministic validation;
- preservation validation;
- atomic output writing;
- cache update;
- cost update.

# Failure classification

Use:

```ts
type BatchFailureClass =
  | "transient"
  | "rate-limit"
  | "expired"
  | "authentication"
  | "billing"
  | "configuration"
  | "policy"
  | "schema"
  | "content-validation"
  | "unknown";
```

Retry:

- transient failures;
- rate limits;
- expired items;
- selected schema failures through one repair;
- selected content-validation failures through one repair.

Do not automatically retry:

- authentication failures;
- billing failures;
- invalid configuration;
- unsupported models;
- deterministic policy rejection;
- missing source files.

# Repair strategy

Do not place repair requests in the original batch.

After import:

1. identify validation failures;
2. create targeted repair payloads;
3. include only failed validation rules;
4. include compact canonical facts;
5. include the invalid result;
6. include narration only when required;
7. submit repairs in a repair batch or run synchronously.

Default repair mode:

```text
batch
```

Allow:

```text
--repair-mode sync
```

Maximum validation repair attempts:

```text
1
```

Do not regenerate successful languages.

# Canonical facts and dependencies

Generate canonical facts once per English source hash.

Prefer deterministic extraction.

When model extraction is required:

- create one canonical-facts item;
- import and validate it;
- cache it;
- only then create dependent localization items.

Use stages:

## Stage 1

```text
source parsing
canonical-fact extraction where cache is missing
```

## Stage 2

```text
English Short
German localization
Spanish localization
French localization
Portuguese localization
```

## Stage 3

```text
character analysis
visual analysis
thumbnail prompt preparation
```

Do not create dependent batch items before required cached facts exist.

# Main-character limit

Reuse the existing character implementation.

Enforce:

```ts
export const MAX_MAIN_CHARACTERS_PER_STORY = 3 as const;
```

A story may select one, two, or three characters.

Three is a hard maximum, not a target.

Do not permit configuration above three.

Character analysis must use only:

- English narration;
- compact canonical facts;
- compact existing character summaries.

Do not send translations.

# Character-analysis batching

Use one character-analysis item per episode when the cache is missing.

Do not submit one request per language.

The result must include:

- candidates;
- ranking;
- up to three selected IDs;
- character definitions;
- exclusions;
- production defaults;
- continuity rules.

Cache by:

- English source hash;
- canonical-facts hash;
- prompt version;
- maximum character limit.

# Thumbnail analysis batching

Generate:

- one canonical 16:9 full-thumbnail concept;
- one canonical 9:16 Short-thumbnail concept.

Use one visual-analysis item per episode where the cache is missing.

Send only:

- compact visual summary;
- canonical facts;
- selected compact character definitions;
- visual identity version.

Derive localized thumbnail prompt variants locally after translations are imported.

Do not generate actual images during localization import.

# Prompt caching compatibility

Structure prompts with stable prefixes:

1. static system instructions;
2. output schema;
3. language rules;
4. variable story metadata;
5. canonical facts;
6. narration.

Do not insert dynamic timestamps, paths, batch IDs, or random values into the static prefix.

Use stable prompt versions.

Read actual cached-token usage where available.

# Cost tracking

Track batch and synchronous costs separately.

Use:

```ts
type PricingMode = "batch" | "sync";

interface ModelPricing {
  readonly model: string;

  readonly sync: {
    readonly inputUsdPerMillionTokens: number;
    readonly cachedInputUsdPerMillionTokens?: number;
    readonly outputUsdPerMillionTokens: number;
  };

  readonly batch?: {
    readonly inputUsdPerMillionTokens: number;
    readonly cachedInputUsdPerMillionTokens?: number;
    readonly outputUsdPerMillionTokens: number;
  };
}
```

Do not blindly calculate batch cost as exactly half when explicit configured batch prices exist.

Use:

```ts
interface LocalizationCostEntry {
  readonly localBatchId?: string;
  readonly openAIBatchId?: string;
  readonly customId?: string;

  readonly episodeNumber: string;
  readonly operation: BatchOperation;
  readonly language?: LanguageCode;

  readonly processingMode: ProcessingMode;
  readonly model: string;

  readonly inputTokens: number;
  readonly cachedInputTokens?: number;
  readonly outputTokens: number;

  readonly estimatedInputCostUsd?: number;
  readonly estimatedOutputCostUsd?: number;
  readonly estimatedTotalCostUsd?: number;

  readonly fullMarkdownAlternativeTokens?: number;
  readonly tokensAvoided?: number;

  readonly successful: boolean;
}
```

When pricing is unknown:

- report tokens;
- report cost as unavailable;
- do not guess.

# Idempotency

Before creating an item, check:

- source hash;
- language;
- operation;
- prompt version;
- model;
- adaptation mode;
- schema version;
- canonical-facts hash;
- configuration hash;
- existing output hash;
- active batch index entries.

Skip unchanged successful outputs.

Do not submit cached items.

If every item is cached:

- do not create an empty batch;
- print a successful no-op summary.

# Duplicate prevention

Before submission, search the index for an active item with the same:

- custom ID;
- source hash;
- configuration hash;
- operation;
- language.

Do not submit duplicates unless:

```text
--force
```

Even with force, create a new attempt-suffixed custom ID.

# Atomic writes

Use atomic writes for:

- JSONL files;
- manifests;
- index;
- downloaded results;
- downloaded errors;
- output Markdown;
- cache records;
- cost reports;
- character maps;
- thumbnail prompt files.

Never leave partial production files.

# Logging

Use the existing structured logger.

Log:

- local batch ID;
- OpenAI batch ID;
- custom ID;
- index action;
- manifest path;
- batch status;
- source file;
- episode;
- operation;
- language;
- model;
- processing mode;
- source hash;
- configuration hash;
- prompt version;
- estimated tokens;
- actual tokens;
- cached tokens;
- cost;
- validation status;
- output paths;
- retry decision;
- cache hit;
- elapsed time.

Do not log:

- API keys;
- raw complete stories;
- full raw responses in normal mode;
- complete JSONL bodies in normal mode;
- sensitive environment values.

# Dry run

Dry run must:

- discover source files;
- parse Markdown locally;
- check canonical-fact caches;
- build compact payload plans;
- estimate tokens;
- calculate batch grouping;
- show custom IDs;
- show local batch IDs that would be created;
- show planned index entries;
- show outputs;
- show cached items;
- estimate synchronous cost;
- estimate batch cost;
- make no API calls;
- write no production output;
- not modify the index.

# Validate-only

Validation-only must:

- validate English sources;
- validate parsed narration;
- validate canonical facts;
- validate existing translations;
- validate Shorts;
- validate character maps;
- validate visual prompts;
- validate batch manifests;
- validate the batch index;
- validate JSONL structure;
- validate custom-ID uniqueness;
- make no API calls;
- modify no files.

# Expired batches

When a batch expires:

- import completed results where available;
- mark unfinished items as expired;
- update the manifest;
- update the index;
- create a retry batch with only unfinished eligible items;
- do not regenerate successful items;
- preserve lineage.

# Batch lineage

Use:

```ts
interface BatchLineage {
  readonly rootLocalBatchId: string;
  readonly parentLocalBatchId?: string;
  readonly retryNumber: number;

  readonly reason?:
    | "failed-items"
    | "expired-items"
    | "validation-repair"
    | "manual-force";
}
```

Detect and reject lineage cycles.

# Cleanup

Support:

```bash
npm run stories:batches -- \
  cleanup \
  --older-than-days 30
```

Cleanup must:

- preserve production outputs;
- preserve final cost summaries;
- preserve active batches;
- update or rebuild the index;
- require confirmation unless `--yes`;
- never delete remote OpenAI files unless explicitly configured.

Before deleting local artifacts:

- check manifest status;
- check index status;
- check import completion;
- ensure no active child retry depends on them.

# Environment configuration

Support:

```text
STORY_LOCALIZATION_SOURCE_DIR
STORY_LOCALIZATION_OUTPUT_DIR

STORY_LOCALIZATION_MODE=batch
STORY_LOCALIZATION_MODEL
STORY_LOCALIZATION_ADAPTATION_MODE

STORY_BATCH_AUTO_SUBMIT=false
STORY_BATCH_WAIT=false
STORY_BATCH_AUTO_IMPORT=false
STORY_BATCH_POLL_INTERVAL_SECONDS=60

STORY_BATCH_MAX_REQUESTS
STORY_BATCH_MAX_INPUT_BYTES
STORY_BATCH_MAX_PROMPT_TOKENS

STORY_BATCH_FALLBACK_TO_SYNC=false
STORY_BATCH_REPAIR_MODE=batch

STORY_BATCH_INDEX_PATH
STORY_BATCH_LOCK_STALE_SECONDS

OPENAI_API_KEY
```

Priority:

```text
CLI
→ environment variables
→ repository configuration
→ built-in defaults
```

Validate configuration at startup.

# Typed errors

Reuse existing errors where practical.

Add:

```ts
BatchConfigurationError;
BatchPreparationError;
BatchInputValidationError;
BatchDuplicateCustomIdError;
BatchUploadError;
BatchSubmissionError;
BatchStatusError;
BatchResultDownloadError;
BatchResultParseError;
BatchUnknownCustomIdError;
BatchImportError;
BatchExpiredError;
BatchCancellationError;
BatchLockError;
BatchRetryError;
BatchOutputPersistenceError;

BatchIndexConfigurationError;
BatchIndexReadError;
BatchIndexWriteError;
BatchIndexValidationError;
BatchIndexDuplicateEntryError;
BatchIndexLookupError;
BatchIndexMismatchError;
BatchIndexRepairError;
BatchIndexLockError;
```

Include typed causes.

Do not expose secrets in errors.

# Architecture

Adapt existing modules.

The effective implementation may contain:

```text
src/story-localization/
  source-story-parser.ts
  compact-story-source.ts
  canonical-facts.service.ts
  request-payload-builder.ts
  request-token-estimator.ts
  localized-production-templates.ts
  translation-prompt-builder.ts
  english-short-prompt-builder.ts
  repair-request-builder.ts
  localization-validator.ts
  localization-writer.ts
  localization-cost-tracker.ts

src/story-batches/
  story-batch.types.ts
  story-batch.schemas.ts
  story-batch-planner.ts
  story-batch-jsonl-writer.ts
  story-batch-manifest.service.ts
  story-batch-index.service.ts
  story-batch-index-repair.service.ts
  story-batch-lookup.service.ts
  story-batch-client.ts
  story-batch-submission.service.ts
  story-batch-status.service.ts
  story-batch-result-parser.ts
  story-batch-import.service.ts
  story-batch-retry.service.ts
  story-batch-lock.service.ts
  story-batch-cleanup.service.ts
  story-batch-cost.service.ts
  story-batch.errors.ts
  story-batch.cli.ts
```

Do not add duplicate modules where equivalents exist.

# Unit tests

Add or extend tests for:

1. English full-story discovery;

2. narration extraction;

3. compact source construction;

4. exclusion of complete Markdown;

5. deterministic custom-ID generation;

6. custom-ID uniqueness;

7. custom-ID stability;

8. forced-attempt suffix;

9. JSONL serialization;

10. malformed JSONL rejection;

11. empty batch rejection;

12. deterministic batch splitting;

13. manifest persistence;

14. atomic manifest updates;

15. batch state transitions;

16. result mapping by custom ID;

17. output-order independence;

18. partial success;

19. expired-item handling;

20. failed-item retry planning;

21. cache-based skipping;

22. duplicate active-batch prevention;

23. batch cost calculation;

24. hard maximum of three characters;

25. deterministic Markdown rendering;

26. batch-index initialization;

27. empty index creation;

28. index schema validation;

29. index atomic writes;

30. index lock acquisition;

31. stale index-lock handling;

32. index entry insertion;

33. index entry update;

34. duplicate local-ID rejection;

35. duplicate OpenAI-ID rejection;

36. lookup by local ID;

37. lookup by OpenAI ID;

38. unique prefix lookup;

39. ambiguous prefix rejection;

40. latest selection by timestamp;

41. episode filtering;

42. status filtering;

43. ready-for-import filtering;

44. pending filtering;

45. failed filtering;

46. index/manifest mismatch detection;

47. manifest-authoritative repair;

48. rebuild from manifests;

49. malformed manifest reporting;

50. orphaned result detection;

51. orphaned error detection;

52. lineage-cycle rejection;

53. missing-parent detection;

54. imported/requiresImport invariant;

55. completed/requiresImport invariant;

56. cleanup index update;

57. index JSON output;

58. deterministic index sorting;

59. index rebuild preserving valid annotations;

60. no index mutation during dry run.

# Integration tests

Use mocked OpenAI clients.

Test:

1. batch preparation for one episode;

2. batch preparation for multiple episodes;

3. five localization items per episode;

4. cached canonical facts skipping Stage 1;

5. uncached facts requiring Stage 1;

6. batch upload;

7. batch submission;

8. local and OpenAI IDs persisted;

9. index entry created during preparation;

10. index updated after submission;

11. status retrieval;

12. index updated after status refresh;

13. completed result import;

14. output order differing from input order;

15. one failed language with successful others;

16. successful languages persisted independently;

17. failed language retried independently;

18. expired batch with partial results;

19. schema-invalid result;

20. content-invalid result;

21. targeted repair batch;

22. duplicate import prevention;

23. duplicate submission prevention;

24. CLI interruption and later resume;

25. lock contention;

26. cancellation;

27. no implicit synchronous fallback;

28. synchronous development mode;

29. dry run making no API calls;

30. validate-only making no API calls;

31. all cached outputs creating no batch;

32. English full story copied unchanged;

33. localized Markdown rendering;

34. character-analysis batch item;

35. maximum three characters;

36. visual-analysis batch item;

37. image generation not triggered;

38. list command reading the index;

39. latest command;

40. pending command;

41. ready command;

42. failed command;

43. find-by-episode command;

44. lookup by local batch ID;

45. lookup by OpenAI batch ID;

46. import through OpenAI ID;

47. retry through local ID;

48. refresh all active batches;

49. import-ready processing multiple batches;

50. one import-ready failure not stopping others;

51. rebuild-index after index deletion;

52. rebuild-index after machine restart;

53. manifest/index mismatch repair;

54. malformed manifest excluded with report;

55. status updates reflected in index;

56. imported state reflected in index;

57. retry child reflected in index;

58. parent-child lineage preserved;

59. cleanup removes eligible entries only;

60. active batches preserved during cleanup.

Do not make real API calls in tests.

# TypeScript quality requirements

Use:

- strict TypeScript;
- no explicit `any`;
- no implicit `any`;
- readonly structures;
- discriminated unions;
- exhaustive switches;
- typed errors;
- Zod validation;
- dependency injection;
- small cohesive services;
- async filesystem APIs;
- atomic writes;
- bounded concurrency;
- explicit timeouts;
- restart-safe persistence.

Do not silence compiler errors with unsafe assertions.

Add concise TSDoc for:

- batch lifecycle;
- custom-ID generation;
- local and remote ID lookup;
- index authority rules;
- index atomicity;
- index locking;
- index rebuild behavior;
- batch lineage;
- result mapping;
- retry eligibility;
- import idempotency;
- cost calculation;
- compact request construction.

# Implementation workflow

Complete:

1. inspect the repository;
2. locate translation modules;
3. locate Markdown parsing;
4. locate OpenAI clients;
5. locate canonical facts;
6. locate character extraction;
7. locate thumbnail analysis;
8. locate cost tracking;
9. locate caching and manifests;
10. locate CLI conventions;
11. identify synchronous localization calls;
12. add processing mode abstraction;
13. preserve synchronous mode;
14. implement compact batch payloads;
15. implement deterministic custom IDs;
16. implement JSONL writing;
17. implement manifests;
18. implement the batch index schema;
19. implement atomic index persistence;
20. implement index locks;
21. implement lookup by local and OpenAI IDs;
22. implement index filtering;
23. implement latest, pending, ready, and failed commands;
24. implement index verification;
25. implement index rebuilding;
26. implement index repair;
27. implement upload and submission;
28. update index during submission;
29. implement status retrieval;
30. update index during status refresh;
31. implement result download;
32. implement result parsing;
33. implement per-item validation;
34. implement independent output persistence;
35. update index during import;
36. implement retry lineage;
37. update index for retry batches;
38. implement expiration handling;
39. implement cancellation;
40. implement cleanup;
41. integrate token and cost reporting;
42. integrate staged dependencies;
43. preserve three-character logic;
44. preserve on-demand image generation;
45. add CLI commands;
46. add unit tests;
47. add integration tests;
48. run formatting;
49. run linting;
50. run strict type checking;
51. run all tests;
52. fix all introduced failures.

# Required final report

After implementation, provide:

1. implementation summary;
2. existing modules reused;
3. new modules added;
4. changed-file tree;
5. batch lifecycle;
6. processing-mode behavior;
7. batch grouping strategy;
8. example custom IDs;
9. example abbreviated JSONL line;
10. local batch directory structure;
11. full `batch-index.json` structure;
12. index authority and repair behavior;
13. lookup behavior;
14. latest, pending, ready, and failed commands;
15. import-ready behavior;
16. restart recovery behavior;
17. dependency-stage behavior;
18. failed-item retry behavior;
19. validation-repair behavior;
20. expiration behavior;
21. synchronous fallback behavior;
22. compact input behavior;
23. before-and-after token estimate;
24. estimated synchronous cost;
25. estimated Batch API cost;
26. expected savings;
27. all CLI commands;
28. dry-run example;
29. submission example;
30. lookup example;
31. status example;
32. import example;
33. import-ready example;
34. retry-failed example;
35. rebuild-index example;
36. verify-index example;
37. test results;
38. lint results;
39. type-check results;
40. known limitations.

Do not stop at an implementation plan.

Implement, test, and validate the complete Batch API production workflow with durable batch-index handling.
