You are working in an existing TypeScript CLI application that rewrites English source stories into optimized full-length and short-form YouTube horror stories in multiple target languages.

Your task is to inspect the existing implementation and directly refactor the story-rewrite pipeline to make OpenAI rewrite requests materially faster, cheaper, more reliable, and easier to observe while preserving approximately the same story quality.

Do not create a separate branch. Work in the current branch.

Do not stop after analysis or planning. Inspect the repository, create an implementation plan using the repository’s existing conventions, and then implement the changes.

The user handles all metadata generation elsewhere. The story-rewrite request must generate only the rewritten story content. It must not generate SEO metadata, tags, hashtags, thumbnail text, visual direction, content disclosures, diagnostics, preservation checklists, duration estimates, or editorial commentary.

## Critical non-regression requirement: preserve language-specific settings

The existing pipeline currently has language-specific rewrite and localization settings that are selected and added through the prompt builder.

These language-specific settings are already implemented and must remain intact.

You must:

- locate the existing language-specific settings;
- locate the prompt-builder logic that selects and inserts them;
- preserve their current content and behavior;
- preserve their current target-language mappings;
- preserve their format-specific behavior where applicable;
- continue adding them through the existing prompt-builder abstraction;
- ensure every supported language still receives the correct settings;
- ensure English-to-English optimization continues receiving its existing English-specific settings;
- ensure localized full and short rewrites continue receiving their existing language-specific settings;
- retain the current ordering of rules when ordering may influence model behavior;
- add regression tests proving that the appropriate language-specific settings are included for every supported language.

Do not:

- delete the language-specific settings;
- replace them with generic localization instructions;
- substantially shorten them;
- paraphrase or rewrite them merely to reduce prompt size;
- merge all languages into one generic rule set;
- inline them directly into command handlers or OpenAI client code;
- move them outside the prompt-builder path;
- generate them dynamically with an AI request;
- omit them from repair requests when a repair could affect linguistic quality;
- alter their wording unless a change is strictly necessary to fix an existing defect.

Prompt optimization must focus on removing duplicated generic instructions, metadata-generation instructions, diagnostics, repeated workflow explanations, and unnecessary output fields.

It must not achieve a smaller prompt by weakening or removing the existing language-specific settings.

Before modifying prompt construction, record which language-specific setting block is currently used for each supported language. After the refactor, verify that the same effective language-specific settings remain present in the generated prompt.

If the language settings are distributed across several existing modules, preserve the existing public behavior and consolidate their storage only when it can be done without changing their wording, selection, ordering, or semantics.

Treat any accidental loss or alteration of these settings as a release-blocking regression.

## Primary goals

Implement the following changes:

1. Keep OpenAI reasoning effort configured as `high`.
2. Reduce unnecessarily large output-token limits.
3. Remove metadata generation from story-rewrite requests.
4. Remove model-generated diagnostics and preservation checklists.
5. Use a small, strict structured-output schema.
6. Optimize stable generic prompt sections for prompt caching.
7. Remove duplicated and overlapping generic instructions.
8. Preserve all existing language-specific prompt settings.
9. Continue injecting language-specific settings through the prompt builder.
10. Generate the final rewritten story in one model pass.
11. Calculate deterministic values such as word count in application code.
12. Stream responses where reliably supported.
13. Persist request, response, validation, usage, retry, timing, and cost artifacts.
14. Retry only correctable validation failures.
15. Preserve the existing CLI commands and externally observable behavior unless a change is explicitly required below.

## Existing commands

Review and update the implementation behind the existing commands:

```bash
stories rewrite-full
stories rewrite-short
```

Do not replace these commands.

Do not add a parallel implementation that leaves the current rewrite path unchanged. Refactor the actual production path used by both commands.

## Repository investigation

Before editing code, trace the complete rewrite workflow:

1. CLI command registration.
2. Command arguments and options.
3. Source-story loading.
4. Optimized-English source selection.
5. Target-language selection.
6. Full-versus-short selection.
7. Prompt construction.
8. Language-specific setting selection.
9. OpenAI request construction.
10. Structured-output schema.
11. Response parsing.
12. Retry behavior.
13. Artifact persistence.
14. Final Markdown or JSON rendering.
15. Downstream consumers.
16. Existing tests.
17. Configuration and environment variables.
18. Logging and observability.

Specifically identify:

- all supported target languages;
- the exact language-specific settings currently defined for each language;
- the code path that adds those settings to the prompt;
- whether full and short rewrites use different language settings;
- whether English-to-English optimization uses a dedicated English setting block;
- whether repair or retry prompts currently include language-specific rules;
- any downstream code that expects metadata returned by the rewrite request.

Document these findings in the repository’s existing planning or task location before implementation.

## Required model output

The rewrite model must return only:

```ts
export interface StoryRewriteResult {
  title: string;
  narration: string;
}
```

Use strict structured output with:

- `type: "object"`;
- `additionalProperties: false`;
- `title` required;
- `narration` required;
- both values constrained to strings;
- no nested metadata;
- no diagnostics;
- no preservation checklist;
- no adaptation notes;
- no word count;
- no estimated duration;
- no SEO fields;
- no audio-production settings.

The narration may contain paragraph breaks inside one string.

If the existing pipeline genuinely does not require the model to generate a title, prefer preserving or deriving the title deterministically. However, retain the result contract above where needed for compatibility. Do not create a separate expensive request solely to generate a title.

If downstream code expects `narrationParagraphs`, derive it deterministically:

```ts
export function splitNarrationParagraphs(narration: string): string[] {
  return narration
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
```

Do not ask the model to return each paragraph as a separate schema property or array item unless an unavoidable existing constraint requires it.

## OpenAI request configuration

Introduce or update a centralized, strictly typed configuration.

Use these defaults:

```ts
export interface StoryRewriteModelConfig {
  model: string;
  reasoningEffort: "high";
  fullMaxOutputTokens: number;
  shortMaxOutputTokens: number;
  fullMinWords: number;
  fullMaxWords: number;
  shortMinWords: number;
  shortMaxWords: number;
  maxRepairAttempts: number;
  stream: boolean;
}

export const DEFAULT_STORY_REWRITE_MODEL_CONFIG: StoryRewriteModelConfig = {
  model: "gpt-5.5",
  reasoningEffort: "high",
  fullMaxOutputTokens: 5_000,
  shortMaxOutputTokens: 1_200,
  fullMinWords: 1_650,
  fullMaxWords: 1_850,
  shortMinWords: 154,
  shortMaxWords: 180,
  maxRepairAttempts: 1,
  stream: true,
};
```

Adapt names to existing project conventions where appropriate, but preserve the semantics.

Use the project’s current configuration mechanism. Support existing environment-variable or CLI overrides where they already exist.

Do not spread hardcoded values throughout command handlers, prompt builders, validators, and OpenAI services.

Validate configuration at application startup or command initialization.

Reject invalid values such as:

- negative token limits;
- minimum word counts greater than maximum word counts;
- unsupported reasoning effort;
- negative retry counts.

## Prompt-builder architecture

The prompt builder must remain the single authoritative place where the complete rewrite prompt is assembled.

Keep prompt construction pure and testable.

Use typed inputs similar to:

```ts
export interface BuildStoryRewritePromptInput {
  format: "full" | "short";
  targetLanguage: SupportedLanguage;
  episodeNumber?: number;
  sourceTitle?: string;
  sourceStory: string;
}
```

Preserve or introduce a dedicated language-settings resolver:

```ts
export interface LanguageRewriteSettings {
  language: SupportedLanguage;
  instructions: readonly string[];
}

export function getLanguageRewriteSettings(
  language: SupportedLanguage,
): LanguageRewriteSettings {
  // Return the existing language-specific settings without changing them.
}
```

Adapt this to the project’s current abstractions rather than creating unnecessary duplicate layers.

The command handlers must not manually append language instructions.

The OpenAI client must not manually append language instructions.

All language-specific settings must be selected and inserted through the prompt builder.

## Preserve language-specific settings exactly

The prompt-builder refactor must preserve the current effective prompt rules for all supported languages.

Before changing anything, generate or snapshot representative prompts for:

- English full;
- English short;
- German full;
- German short;
- Spanish full;
- Spanish short;
- French full;
- French short;
- Portuguese full;
- Portuguese short;
- every additional language currently supported by the repository.

Use the actual supported-language enum or configuration rather than assuming the list above is complete.

After the refactor, compare the generated prompts and verify that each target language still contains its existing language-specific instruction block.

The optimization may change generic shared sections, but the existing language-specific sections must remain semantically and textually stable.

Use snapshot tests or exact normalized-string assertions for these blocks.

Only normalize insignificant line-ending differences if required for cross-platform tests.

Do not make assertions so loose that missing language rules could pass unnoticed.

## Prompt caching

Optimize the prompt layout for cache reuse while preserving the existing language-specific settings.

Use an order similar to:

1. stable role and final-output objective;
2. stable canonical-story preservation rules;
3. stable narration and retention requirements;
4. stable format-specific rules;
5. existing language-specific settings selected through the prompt builder;
6. stable structured-output requirements;
7. variable request data at the end:
   - target language;
   - story format;
   - episode number;
   - source title;
   - source story.

The exact ordering may follow the existing implementation if moving language settings would alter behavior. In that case, preserve their current effective order and optimize the remaining sections around them.

Place highly variable values near the end of the prompt.

Do not place these values in the stable prefix:

- source story;
- episode-specific title;
- episode number where avoidable;
- source hashes;
- timestamps;
- request IDs;
- output paths;
- retry counters.

Avoid changing whitespace, heading names, or rule ordering between otherwise identical requests without a functional reason.

Do not claim that a prompt is cached unless the API usage data actually reports cached tokens.

## Remove only unnecessary generic prompt content

Search existing full and short rewrite prompts for instructions requesting:

- SEO descriptions;
- tags;
- hashtags;
- thumbnail text;
- visual direction;
- content disclosure;
- metadata blocks;
- audio-generation instructions;
- sound-effect metadata;
- word-count diagnostics;
- duration diagnostics;
- preservation booleans;
- adaptation notes;
- removed-filler explanations;
- editorial commentary;
- explanations of changes;
- multiple alternatives;
- visible analysis;
- self-critique;
- explicit multi-pass translation and rewriting;
- duplicated generic preservation instructions.

Remove these responsibilities from the rewrite-model request.

Do not remove existing language-specific instructions even when they appear detailed.

When a generic rule duplicates a language-specific rule, prefer retaining the language-specific rule and removing only the redundant generic wording, provided this does not weaken other languages.

## One-pass rewrite behavior

The prompt must instruct the model to produce the final rewrite directly.

Include an instruction equivalent to:

```text
Perform all planning, comparison, canonical-story preservation checks,
localization decisions, and quality review internally.

Return only the final production-ready rewritten story matching the required
structured-output schema.

Do not return analysis, explanations, editorial commentary, alternative
versions, diagnostics, checklists, metadata, or duplicated story content.
```

Do not explicitly instruct the model to execute visible stages such as:

1. translate;
2. critique;
3. optimize;
4. review;
5. rewrite again.

Describe the final expected result precisely and request it once.

## Story-quality requirements

Preserve the current quality objectives for YouTube horror stories.

The final narration must remain:

- natural when spoken aloud;
- idiomatic in the target language;
- optimized for audience retention;
- immediately engaging;
- suspenseful without excessive repetition;
- easy to understand when heard once;
- concrete rather than synopsis-like;
- structurally faithful to the optimized canonical English source;
- consistent in character names and identities;
- consistent in character relationships;
- consistent in chronology;
- consistent in locations;
- consistent in supernatural rules;
- consistent in important clues;
- consistent in critical objects;
- consistent in major escalation beats;
- consistent in the primary reveal;
- consistent in the ending;
- free from contradictory invented facts.

Express shared preservation rules once.

Then apply the existing language-specific settings unchanged through the prompt builder.

For localized stories, preserve the existing distinction between creative localization and literal translation.

Do not replace detailed language-specific guidance with a generic instruction such as “write idiomatically.”

## Source-story behavior

The optimized English full story remains the canonical source for downstream localized full and short rewrites where that is the existing workflow.

Do not change source-selection semantics as part of this performance refactor.

Verify that:

- an optimization failure still aborts downstream localization;
- localized full stories are generated from the optimized English version;
- localized short stories are generated from the optimized English version or the currently established canonical source;
- no localized story is accidentally generated from another localized story;
- existing shared artifacts remain sourced according to current pipeline rules.

Do not introduce unrelated changes to character-map generation, episode creation, or downstream media production.

## Word-count constraints

Use these default narration ranges:

```text
Full story: 1,650–1,850 words
Short story: 154–180 words
```

The configured range applies to narration only.

It does not include:

- title;
- Markdown headings;
- production instructions;
- metadata;
- technical comments;
- hashes.

Tell the model not to reach the target length using:

- generic filler;
- repeated warnings;
- duplicated descriptions;
- summaries replacing dramatic scenes;
- repeated internal monologue;
- redundant conclusions;
- editorial explanation.

Calculate the word count deterministically in TypeScript:

```ts
export function countWords(value: string): number {
  const normalized = value.trim();

  if (!normalized) {
    return 0;
  }

  return normalized
    .split(/\s+/u)
    .filter(Boolean)
    .length;
}
```

Keep word-counting logic behind a focused abstraction if the application may later support languages for which whitespace counting is unsuitable.

Do not ask the model to report its own word count.

## Deterministic validation

Validate the parsed structured result in application code.

Validate at least:

1. strict schema compliance;
2. non-empty title;
3. non-empty narration;
4. configured narration word range;
5. absence of metadata headings;
6. absence of diagnostics;
7. absence of editorial commentary;
8. absence of production instructions inside narration;
9. absence of obvious JSON or schema leakage;
10. absence of duplicated episode numbers in the title;
11. absence of obvious response truncation;
12. probable use of the requested target language.

Use typed results:

```ts
export type StoryRewriteValidationCode =
  | "EMPTY_TITLE"
  | "EMPTY_NARRATION"
  | "TOO_SHORT"
  | "TOO_LONG"
  | "UNEXPECTED_METADATA"
  | "UNEXPECTED_COMMENTARY"
  | "UNEXPECTED_PRODUCTION_INSTRUCTIONS"
  | "POSSIBLE_TRUNCATION"
  | "DUPLICATE_EPISODE_NUMBER"
  | "WRONG_LANGUAGE"
  | "INVALID_STRUCTURED_OUTPUT";

export interface StoryRewriteValidationIssue {
  code: StoryRewriteValidationCode;
  message: string;
  repairable: boolean;
  severity: "warning" | "error";
}

export interface StoryRewriteValidationResult {
  valid: boolean;
  wordCount: number;
  issues: readonly StoryRewriteValidationIssue[];
}
```

Adapt these types to established project conventions.

Use deterministic checks wherever practical.

For language detection:

- reuse the project’s existing language detector if one exists;
- avoid rejecting valid content based on a weak heuristic;
- treat uncertain detection as a warning;
- treat a clearly incorrect language as an error.

Do not ask the model to provide a checklist claiming it passed validation.

## Targeted repair behavior

Do not regenerate the complete story automatically for every validation issue.

Classify issues as repairable or non-repairable.

Potentially repairable issues include:

- slightly under the target word range;
- slightly over the target word range;
- accidental metadata appended after narration;
- accidental commentary before or after narration;
- duplicated episode number;
- malformed but recoverable title;
- minor structured-output formatting issue where safe parsing is available.

For a repair request, provide only:

- the generated title;
- the generated narration;
- the exact validation issues;
- the required correction;
- the target language;
- the format;
- the existing language-specific settings from the same prompt-builder mechanism;
- instructions to preserve unaffected content.

The repair prompt must continue to include the target language’s existing language-specific settings when the repair can alter narration.

Do not create a generic repair prompt that loses the localization rules.

Do not include the complete canonical source story in a repair request unless the validation failure concerns factual, structural, or canonical-source fidelity and cannot be corrected safely without it.

Example repair intent:

```text
Repair the supplied rewritten story.

Validation issue:
The narration contains 1,924 words, but the allowed range is 1,650–1,850 words.

Shorten the narration to the allowed range while preserving all characters,
chronology, supernatural rules, clues, major escalation beats, primary reveal,
ending, and target-language naturalness.

Apply the supplied existing language-specific settings without modification.

Remove repetition and low-value exposition first.

Return only the strict StoryRewriteResult object.
```

Allow one repair attempt by default.

Do not create unbounded retry loops.

If the result remains invalid:

- persist all attempt artifacts;
- do not overwrite a previously valid story;
- return a typed error;
- include validation codes and safe artifact paths;
- preserve the original root cause.

## Streaming

Use streaming when supported reliably by the installed OpenAI SDK, selected model, and structured-output implementation.

Streaming must:

- capture time to first output event;
- assemble all deltas safely;
- preserve raw events or equivalent debug data when artifact persistence is enabled;
- avoid validating incomplete data;
- avoid writing partial final story files;
- validate only after completion;
- write validated final output atomically;
- support cancellation and timeout cleanup.

If strict structured output and streaming are not reliably compatible in the installed SDK:

1. prioritize schema correctness;
2. use the reliable non-streaming structured-output path;
3. retain a configuration flag for future support;
4. document the limitation;
5. do not implement unsafe regex-based JSON recovery.

Treat streaming as a perceived-latency and observability improvement, not as a guarantee of lower total model runtime.

## Artifact persistence

Persist every story-rewrite run in a logical episode-specific directory using existing repository conventions.

The artifacts must be grouped by:

- episode;
- target language;
- story format;
- rewrite run;
- attempt.

Persist at least:

```text
rewrite/
  request.json
  prompt.txt
  response.raw.json
  response.parsed.json
  validation.json
  usage.json
  timing.json
  cost.json
  attempts/
    01/
      request.json
      prompt.txt
      response.raw.json
      response.parsed.json
      validation.json
      usage.json
      timing.json
    02-repair/
      request.json
      prompt.txt
      response.raw.json
      response.parsed.json
      validation.json
      usage.json
      timing.json
```

Adapt this structure to existing folder conventions rather than introducing an incompatible parallel hierarchy.

Persist enough information to reproduce and audit the request:

- model;
- reasoning effort;
- maximum output tokens;
- target word range;
- target language;
- story format;
- prompt version;
- language-settings identifier or version;
- request timestamp;
- completion timestamp;
- request ID;
- response ID;
- input tokens;
- cached input tokens when reported;
- output tokens;
- reasoning tokens when reported;
- total tokens;
- incomplete or finish reason;
- repair count;
- validation issues;
- estimated cost;
- source-story hash;
- prompt hash;
- language-settings hash;
- final-output hash.

The `language-settings hash` should make accidental changes to language-specific rules visible in artifacts and tests.

Never persist:

- API keys;
- authorization headers;
- secrets;
- unrelated environment variables.

Do not overwrite previous completed runs unless the existing command explicitly supports an overwrite option.

Use atomic filesystem writes for final output.

## Usage parsing

Create a typed adapter for OpenAI usage information.

Handle absent or SDK-version-specific fields safely:

```ts
export interface StoryRewriteUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}
```

Do not invent values that the API did not return.

Store raw usage data separately where useful for forward compatibility.

## Cost estimation

Centralize pricing configuration:

```ts
export interface ModelPricing {
  inputUsdPerMillionTokens: number;
  cachedInputUsdPerMillionTokens?: number;
  outputUsdPerMillionTokens: number;
}

export interface StoryRewriteCostEstimate {
  inputUsd: number;
  cachedInputUsd: number;
  outputUsd: number;
  totalUsd: number;
  pricingSource: string;
  pricingVersion: string;
}
```

Use existing project pricing configuration if available.

Do not scatter model prices throughout the code.

Do not silently hardcode unverified current prices.

If pricing is not configured:

- record usage;
- mark estimated cost as unavailable;
- provide a clear configuration path;
- do not fabricate a cost.

## Timing and performance metrics

Record:

```ts
export interface StoryRewriteTiming {
  startedAt: string;
  firstOutputAt?: string;
  completedAt: string;
  timeToFirstOutputMs?: number;
  totalDurationMs: number;
}
```

Also record where practical:

- prompt-building duration;
- OpenAI request duration;
- response-parsing duration;
- validation duration;
- repair duration;
- artifact-persistence duration;
- final-rendering duration;
- total command duration.

Use the existing logger and observability architecture.

Do not emit full source stories or generated narrations into routine logs.

Store story content only in designated artifacts.

## Error handling

Implement or preserve explicit typed errors for:

- configuration failure;
- prompt-building failure;
- missing language settings;
- unsupported target language;
- OpenAI request failure;
- timeout;
- cancellation;
- incomplete response;
- structured-output failure;
- validation failure;
- repair exhaustion;
- artifact-persistence failure;
- final-file write failure.

Preserve root causes with the standard `cause` property or the project’s established error mechanism.

Include safe context:

- episode;
- format;
- target language;
- attempt number;
- model;
- request ID;
- response ID;
- validation codes;
- artifact directory.

Do not swallow SDK errors.

Do not leak source-story content, generated narration, or secrets into exception messages intended for normal logs.

## Timeout and cancellation

Review current timeout behavior before changing it.

Use the project’s existing abort and cancellation infrastructure where available.

Make timeout configuration explicit and centralized.

Do not add a timeout so aggressive that valid full-story generations routinely fail.

On timeout or cancellation:

- close active streams;
- stop pending repair attempts;
- do not write partial final stories;
- persist safe diagnostic artifacts where possible;
- preserve the timeout or cancellation cause.

## Remove metadata-generation responsibilities

Search the complete rewrite pipeline for:

- `seoDescription`;
- `tags`;
- `hashtags`;
- `thumbnailText`;
- `visualDirection`;
- `contentDisclosure`;
- generated audio instructions;
- generated sound motifs;
- `preservationChecklist`;
- `diagnostics`;
- `adaptationNotes`;
- model-generated word count;
- model-generated duration;
- generated metadata blocks.

Remove these fields from:

- rewrite prompt requirements;
- response schemas;
- rewrite DTOs;
- parsing;
- rewrite validation;
- rewrite-specific persistence;
- rewrite-specific tests;
- downstream rewrite result dependencies.

Do not remove metadata generation from unrelated commands or services.

Do not modify the separate metadata-generation workflow unless required to consume the simplified rewrite result.

The scope is the story-rewrite request used by:

```bash
stories rewrite-full
stories rewrite-short
```

## Deterministic production wrappers

If final Markdown files require production instructions, headings, comments, or hashes, generate those deterministically outside the model request.

The rewrite model must not generate:

- Markdown wrapper headings;
- audio-generation instructions;
- sound motifs;
- metadata sections;
- technical comments;
- source hashes;
- generated markers.

Render final files using application-owned templates:

```text
# Episode ...

[deterministically rendered production instructions]

# Narration Script

[model-generated narration]

[deterministically rendered technical footer]
```

Preserve existing language-specific settings used to create narration. Do not confuse those prompt settings with final Markdown production metadata.

Prefer storing canonical generated output as structured JSON and rendering Markdown downstream.

## Backward compatibility

Review every downstream consumer of the current rewrite response.

Update consumers to use:

```ts
{
  title: string;
  narration: string;
}
```

Derive these values in code where needed:

- paragraph arrays;
- word counts;
- estimated narration duration;
- Markdown wrappers;
- source hashes;
- technical comments.

Remove downstream assumptions that the rewrite request returns metadata.

Do not silently supply fake or empty metadata fields.

If a temporary compatibility adapter is unavoidable:

- isolate it;
- document it;
- mark it deprecated;
- do not let it become the new canonical model.

Ensure existing story output paths and filenames remain compatible unless the current layout is provably broken and the change is within scope.

## Tests

Add or update tests covering at least the following.

### Language-settings regression tests

1. Every supported language resolves to the correct existing settings.
2. English full prompts contain the existing English settings.
3. English short prompts contain the existing English settings.
4. German full and short prompts contain the existing German settings.
5. Spanish full and short prompts contain the existing Spanish settings.
6. French full and short prompts contain the existing French settings.
7. Portuguese full and short prompts contain the existing Portuguese settings.
8. Any additional supported languages are covered automatically or explicitly.
9. Unsupported languages fail clearly.
10. Language settings are added by the prompt builder.
11. Command handlers do not manually append language settings.
12. OpenAI services do not manually append language settings.
13. Existing language-setting wording is preserved.
14. Existing language-setting ordering is preserved where relevant.
15. Language settings remain present in targeted repair prompts.
16. Language-settings hashes remain stable unless intentionally updated.

Prefer table-driven tests based on the actual supported-language collection.

### Prompt tests

17. Stable shared instructions precede variable source data.
18. Source story appears near the end of the prompt.
19. Metadata-generation instructions are absent.
20. Diagnostic-generation instructions are absent.
21. Generic duplicated instructions are removed.
22. Full and short prompts retain their format-specific rules.
23. Prompt output is deterministic for identical inputs.
24. Prompt hashes are stable for identical inputs.
25. Episode-specific values do not unnecessarily alter the stable prefix.

### Request-configuration tests

26. Reasoning effort is `high`.
27. Full rewrites default to `5_000` maximum output tokens.
28. Short rewrites default to `1_200` maximum output tokens.
29. Configuration overrides are respected.
30. Invalid configuration is rejected.
31. The correct structured-output schema is sent.

### Schema and parsing tests

32. Valid `{ title, narration }` responses are accepted.
33. Additional metadata fields are rejected.
34. Missing titles are rejected.
35. Missing narrations are rejected.
36. Malformed structured output produces a typed error.
37. No regex-only JSON parsing is used.

### Validation tests

38. Full-story word ranges are validated.
39. Short-story word ranges are validated.
40. Metadata headings are detected.
41. Editorial commentary is detected.
42. Production instructions inside narration are detected.
43. Duplicate episode numbers are detected.
44. Obvious truncation is detected.
45. Wrong-language output is handled conservatively.
46. Warning-only validation does not incorrectly discard a valid story.
47. Word counting is deterministic and Unicode-safe.

### Repair tests

48. Repairable issues create a targeted repair request.
49. Repair requests contain the existing target-language settings.
50. Repair requests do not include the full source unnecessarily.
51. Maximum repair attempts are enforced.
52. A failed repair returns a typed validation error.
53. Unaffected content is explicitly preserved.

### Artifact tests

54. Request artifacts are persisted.
55. Prompts are persisted.
56. Raw responses are persisted.
57. Parsed responses are persisted.
58. Validation results are persisted.
59. Usage information is persisted.
60. Timing information is persisted.
61. Cost estimates are persisted when pricing exists.
62. Prompt and language-settings hashes are persisted.
63. Attempts are stored separately.
64. Previous completed runs are not silently overwritten.
65. Secrets are not persisted.
66. Final output writes are atomic.

### Streaming and lifecycle tests

67. Stream deltas are assembled correctly where supported.
68. Validation occurs only after completion.
69. Cancellation closes the stream.
70. Timeout leaves no partial final output.
71. Time to first output is recorded.
72. Non-streaming structured output remains available as a safe fallback.

### Downstream tests

73. Markdown rendering still works.
74. Paragraph arrays are derived correctly.
75. Metadata is no longer expected from rewrite responses.
76. Existing filenames and output locations remain compatible.
77. Both CLI commands continue to work.
78. No unrelated story-generation path is broken.

Mock OpenAI requests.

Do not call the live API in tests.

Use realistic full and short story fixtures.

## Performance comparison

Before implementation, record the current behavior:

- prompt character count;
- approximate prompt token count if an existing tokenizer is available;
- output-token ceiling;
- response schema fields;
- metadata fields generated;
- generic duplicated prompt sections;
- language-specific settings and their hashes;
- retry strategy;
- artifact structure;
- timing metrics;
- usage metrics;
- cost metrics.

After implementation, record:

- new prompt character count;
- new output-token ceiling;
- simplified response fields;
- removed metadata responsibilities;
- unchanged language-specific settings and hashes;
- targeted repair behavior;
- deterministic validation;
- usage tracking;
- cached-token tracking;
- timing tracking;
- cost tracking.

Create a concise repository document comparing before and after.

Do not claim a precise latency or cost reduction unless measured using actual completed requests.

Explicitly state that language-specific settings were preserved and were not removed to obtain prompt-size savings.

## Optional benchmark support

Add a safe benchmark or artifact-comparison command only if it fits the current CLI architecture cleanly.

It must not run billable requests automatically during tests.

It should compare completed rewrite artifacts and report:

- model;
- input tokens;
- cached input tokens;
- output tokens;
- reasoning tokens;
- total tokens;
- time to first output;
- total duration;
- estimated cost;
- narration word count;
- validation result;
- repair count;
- prompt hash;
- language-settings hash.

Do not block the core refactor on adding a new CLI benchmark command if the same comparison can be implemented through an internal utility or report generator.

## Implementation process

Perform the work in this order:

1. Inspect the repository.
2. Locate both rewrite commands.
3. Trace the complete production rewrite path.
4. Locate and inventory all language-specific settings.
5. Record how the prompt builder currently selects and inserts them.
6. Generate baseline prompt fixtures or snapshots.
7. Locate current OpenAI configuration and schemas.
8. Locate retry, persistence, and rendering logic.
9. Locate all downstream consumers.
10. Create a concise implementation plan in the repository.
11. Add regression tests protecting existing language-specific settings.
12. Refactor the response schema.
13. Remove metadata generation from rewrite requests.
14. Refactor shared prompt instructions while preserving language settings.
15. Centralize model and token configuration.
16. Add deterministic validation.
17. Add targeted repair behavior.
18. Add or improve streaming where reliably supported.
19. Add usage, timing, cost, and artifact persistence.
20. Update downstream rendering and consumers.
21. Run formatting.
22. Run linting.
23. Run type checking.
24. Run relevant unit and integration tests.
25. Fix all regressions.
26. Compare generated prompts against baseline language-setting fixtures.
27. Review the final diff for unrelated changes.
28. Produce a concise implementation report.

Do not stop after writing the plan.

Implement the changes.

## Coding standards

Use strict TypeScript.

Avoid:

- `any`;
- broad unsafe assertions;
- duplicated configuration;
- mutable global state;
- unbounded retries;
- regex-only structured-output parsing;
- swallowed exceptions;
- partial final files;
- secrets in artifacts;
- full story content in normal logs;
- language-specific settings duplicated across command handlers;
- metadata generation leaking back into rewrite prompts.

Prefer:

- focused services;
- pure prompt builders;
- pure validation functions;
- immutable typed data;
- dependency injection where already established;
- schema validation at external boundaries;
- discriminated unions;
- explicit error classes;
- centralized configuration;
- atomic filesystem operations;
- table-driven language tests;
- stable prompt snapshots;
- documented pricing assumptions.

Add comments explaining non-obvious decisions, especially:

- why language-specific settings must remain untouched;
- how prompt caching influences section ordering;
- why variable source data is placed last;
- why targeted repairs include language-specific settings;
- why deterministic validation replaces model diagnostics;
- how atomic output writes prevent corrupted stories;
- how pricing and usage estimates are derived.

Do not add comments that simply repeat code behavior.

## Acceptance criteria

The implementation is complete only when all of the following are true:

- `stories rewrite-full` still works;
- `stories rewrite-short` still works;
- reasoning effort remains `high`;
- full rewrites default to `5_000` maximum output tokens;
- short rewrites default to `1_200` maximum output tokens;
- the model returns only `title` and `narration`;
- story-rewrite requests no longer generate metadata;
- metadata generation elsewhere is not removed;
- model-generated diagnostics are removed;
- word count is calculated in TypeScript;
- validation is deterministic;
- retries are bounded;
- repair requests are targeted;
- repair prompts preserve the existing target-language settings;
- prompts have a stable cache-friendly structure;
- variable source data is placed near the end;
- the existing language-specific settings remain implemented;
- the existing language-specific settings retain their wording and semantics;
- the existing language-specific settings retain their target-language mappings;
- the prompt builder remains responsible for inserting language settings;
- all supported languages have regression coverage;
- English-to-English optimization retains its English settings;
- full and short localization retain their current language rules;
- prompt-size reduction does not come from deleting language-specific settings;
- request and response artifacts are persisted;
- usage, latency, and cost information are recorded;
- prompt and language-settings hashes are recorded;
- final files are written atomically;
- downstream Markdown output remains valid;
- source-story selection remains correct;
- relevant tests pass;
- linting passes;
- type checking passes;
- no unrelated functionality is removed.

## Final report

At completion, provide a concise report containing:

1. files changed;
2. architecture changes;
3. current supported languages discovered;
4. location of the preserved language-specific settings;
5. how the prompt builder selects and inserts them;
6. proof that their wording and behavior were preserved;
7. metadata responsibilities removed from rewrite requests;
8. resulting OpenAI request configuration;
9. final structured-output schema;
10. deterministic validation behavior;
11. targeted repair behavior;
12. streaming behavior and any SDK limitation;
13. artifact paths;
14. usage, timing, and cost tracking;
15. tests added or updated;
16. commands executed;
17. benchmark or before/after findings;
18. downstream migration notes;
19. remaining limitations;
20. confirmation that no unrelated features were changed.
