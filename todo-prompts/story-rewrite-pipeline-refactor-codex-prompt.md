# Codex Prompt — Refactor and Harden the Story Rewrite Pipeline

You are a senior TypeScript architect working inside an existing production repository.

Analyze and refactor the existing story-rewrite, localization, validation, repair, metadata, and audio-instruction pipeline so that it becomes typed, genre-aware, narration-focused, token-efficient, cost-controlled, deterministic where possible, observable, resumable, testable, backward compatible, and safe for both fictional horror and evidence-led nonfiction.

Do not build a parallel replacement pipeline. Update and simplify the existing implementation.

Preserve current CLI commands, directory and artifact conventions where reasonable, public interfaces, language-specific behavior, `.env` configuration conventions, downstream schemas unless a breaking change is unavoidable, and existing support for canonical English rewrites, full localizations, shorts, metadata, validation, repair, audio instructions, scene planning, and resume behavior.

Do not wait for further confirmation. First inspect and document the existing implementation, create an implementation plan, then implement the changes end to end.

## Primary goals

Refactor the pipeline to:

1. Stop constructing one large monolithic prompt from duplicated and potentially malformed analysis artifacts.
2. Introduce one canonical, runtime-validated intermediate story representation.
3. Select prompt instructions dynamically based on genre, fictionality, narrative mode, locale, story features, allowed invention boundaries, and artifact type.
4. Prevent nonfiction, historical mysteries, documentaries, and true-crime stories from receiving fictional supernatural-writing instructions.
5. Remove prompt fragments, metadata, audio instructions, production notes, and structural commentary from source narration before generation.
6. Ensure story-rewrite and localization prompts produce narration only.
7. Move metadata creation into a separate cheaper-model stage using the model configuration already provided through `.env`.
8. Move audio instructions into a separate deterministic or cheap-model stage.
9. Separate generation, deterministic validation, semantic validation, targeted repair, and full regeneration.
10. Prevent full localized stories from being routed through a small paragraph-repair token budget.
11. Detect `max_output_tokens` exhaustion explicitly and never retry the same unchanged request.
12. Reduce failed-request cost through deterministic preflight checks, request fingerprinting, retry controls, and cost ceilings.
13. Persist all prompts, responses, normalized analyses, token estimates, hashes, costs, validation results, repair attempts, and routing decisions.
14. Keep current language-specific settings, but include only rules relevant to the requested locale and story type.
15. Preserve backward compatibility at external boundaries while simplifying internal representations.

## Current production problems to fix

Known problems include:

- locations classified as characters;
- events or full sentences classified as antagonists;
- historical mysteries receiving supernatural-rule instructions;
- environmental threats treated as intelligent entities;
- empty critical-object lists despite obvious evidence objects;
- stylistic closing lines classified as immutable facts or consequences;
- duplicated injection of immutable facts, character maps, source analysis, story bible, originality review, retention plan, locale guidance, and verification instructions;
- story prompts containing metadata, SEO fields, audio-generation instructions, sound motifs, visual direction, thumbnail text, hashtags, and tags;
- validator or repair models being asked to regenerate complete stories;
- Spanish and German full localization repairs failing because `max_output_tokens` is exhausted;
- failed story rewrites still costing approximately `$0.40`;
- unchanged failed requests being retried;
- metadata or audio failures affecting narration;
- schema instructions referring to a response schema that is not actually supplied.

The refactor must explicitly eliminate these failure modes.

## Repository analysis

Before editing code:

1. Locate all files involved in canonical story rewriting, full localization, short localization, validation, targeted repair, full regeneration, metadata, audio instructions, prompt persistence, OpenAI requests, token accounting, cost accounting, retry logic, resume logic, CLI commands, schemas, and configuration.
2. Trace the complete call graph from each CLI command to the provider request.
3. Identify where each prompt section originates, which sections are duplicated, which schemas are authoritative, which artifacts are diagnostic only, which models and token settings each operation uses, whether validator settings are reused for repair, whether full-story repair is routed to `gpt-5.4-mini`, where incomplete responses are parsed, whether partial output is persisted, whether failed attempts count toward cost, and whether retries distinguish transient from deterministic failures.
4. Measure or estimate current prompt size by section.
5. Create a repository analysis document, implementation plan, and task list.

Then implement the plan without waiting for approval.

## Target pipeline

```text
raw source
  -> deterministic source normalization
  -> source-cleaning report
  -> structured analysis
  -> canonical StoryIR normalization
  -> semantic StoryIR validation
  -> feature and genre classification
  -> compact story contract
  -> applicable prompt-module selection
  -> prompt token-budget enforcement
  -> narration-only prompt compilation
  -> deterministic preflight
  -> generation
  -> deterministic output validation
  -> optional semantic validation
  -> targeted fragment repair when local
  -> controlled full regeneration when global
  -> final validated narration
  -> metadata generation
  -> audio-instruction generation or deterministic resolution
  -> scene and visual planning
```

Metadata, audio instructions, and visual planning must not be prerequisites for narration generation.

## Canonical StoryIR

Introduce one canonical internal representation using strict TypeScript and the repository's runtime schema library.

```ts
type StoryGenre =
  | 'fictional-supernatural'
  | 'fictional-psychological'
  | 'historical-mystery'
  | 'true-crime'
  | 'documentary'
  | 'folklore'
  | 'unknown';

type Fictionality =
  | 'fiction'
  | 'nonfiction'
  | 'fiction-inspired-by-folklore';

type NarrativeMode =
  | 'character-led'
  | 'evidence-led'
  | 'first-person'
  | 'documentary';

type StoryEntityType =
  | 'person'
  | 'group'
  | 'location'
  | 'object'
  | 'organization'
  | 'event'
  | 'phenomenon';

type FactConfidence =
  | 'confirmed'
  | 'probable'
  | 'disputed'
  | 'unknown';

interface StoryEntity {
  id: string;
  name: string;
  type: StoryEntityType;
  role: string;
}

interface StoryFact {
  id: string;
  statement: string;
  confidence: FactConfidence;
  immutable: boolean;
  sourceSegmentIds?: string[];
}

interface StoryIR {
  episodeNumber: string;
  slug: string;
  title: string;
  genre: StoryGenre;
  fictionality: Fictionality;
  narrativeMode: NarrativeMode;
  entities: StoryEntity[];
  facts: StoryFact[];
  centralThreat: {
    type:
      | 'person'
      | 'group'
      | 'supernatural'
      | 'environmental'
      | 'psychological'
      | 'unknown';
    description: string;
    intelligent: boolean;
  };
  hasSupernaturalRule: boolean;
  supernaturalRules: string[];
  criticalObjects: Array<{
    id: string;
    name: string;
    narrativeFunction: string;
    origin?: string;
  }>;
  writtenMessages: Array<{
    text: string;
    preserveVerbatim: boolean;
    sourceSegmentId?: string;
  }>;
  requiredEnding: {
    meaning: string;
    preferredFinalLine?: string;
  };
  allowedInventions: {
    dialogue: boolean;
    internalThoughts: boolean;
    connectiveDetails: boolean;
  };
  outputConstraints: {
    targetLanguage: string;
    targetLocale: string;
    targetWordRange: { min: number; max: number };
    targetDurationSeconds?: number;
    targetWpm?: number;
  };
}
```

Only `StoryIR` may be authoritative during prompt compilation. Legacy artifacts may still be persisted for compatibility and diagnostics, but they must not be independently injected into the final prompt.

## StoryIR normalization

Create a normalization service that:

- distinguishes people, groups, locations, objects, organizations, events, and phenomena;
- classifies mountains, roads, cities, buildings, rooms, and named geographic locations as locations;
- rejects event descriptions or full sentences as people, characters, or antagonists;
- treats environmental danger as environmental and non-intelligent unless explicitly established otherwise;
- separates factual events from stylistic closing lines;
- populates obvious critical objects;
- preserves source provenance where possible;
- uses `unknown`, warnings, or empty arrays instead of fabricated values;
- avoids promoting low-confidence analysis into immutable facts;
- preserves exact written messages only when they exist;
- preserves valid supernatural rules for fictional stories.

Do not silently coerce malformed values into valid-looking but incorrect data.

## Semantic StoryIR validation

Add domain-level validation:

```ts
interface StoryValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: 'warning' | 'error';
  repairable: boolean;
}
```

Detect at least:

- `LOCATION_CLASSIFIED_AS_CHARACTER`
- `EVENT_CLASSIFIED_AS_CHARACTER`
- `SENTENCE_USED_AS_ANTAGONIST`
- `SUPERNATURAL_RULE_IN_NONFICTION`
- `SUPERNATURAL_RULE_IN_HISTORICAL_MYSTERY`
- `INVENTED_DIALOGUE_ENABLED_FOR_NONFICTION`
- `INVENTED_INTERNAL_THOUGHTS_ENABLED_FOR_NONFICTION`
- `ENVIRONMENTAL_THREAT_MARKED_INTELLIGENT`
- `NO_EVIDENCE_OBJECTS`
- `PREFERRED_FINAL_LINE_USED_AS_FACT`
- `MISSING_REQUIRED_ENDING`
- `CONFLICTING_GENRE_AND_FICTIONALITY`
- `DUPLICATE_ENTITY_WITH_CONFLICTING_TYPE`
- `EMPTY_OR_GENERIC_THREAT`
- `INVALID_WORD_RANGE`
- `OUTPUT_SCHEMA_MISSING`
- `FULL_STORY_ROUTED_TO_TARGETED_REPAIR`
- `METADATA_INCLUDED_IN_NARRATION_PROMPT`
- `AUDIO_INSTRUCTIONS_INCLUDED_IN_NARRATION_PROMPT`

Errors must block expensive generation during preflight. Warnings must be persisted and logged. Never report success unless validation actually ran and returned no errors.

## Genre policies

Create a centralized genre-policy registry.

### Historical mystery, documentary, and true crime

- use evidence-led narration;
- do not invent dialogue, internal thoughts, motives, or precise undocumented actions;
- distinguish confirmed facts, probable reconstruction, disputed claims, and unknown details;
- build tension through chronology, evidence, environmental hazards, and unresolved contradictions;
- do not personify the environment as intelligent;
- do not introduce supernatural rules, adaptive threats, counter-rules, hidden rituals, fictional defenses, or unsupported climaxes;
- do not overstate certainty;
- allow vivid but explicitly qualified reconstruction.

### Fictional supernatural horror

- preserve established supernatural rules;
- ensure attempted solutions follow from information available to the protagonist;
- ensure failed solutions reveal limitations of existing rules rather than unrelated mechanics;
- allow dialogue and internal thoughts according to `allowedInventions`;
- preserve central threat logic and final consequences;
- use observable consequences instead of structural commentary.

### Fictional psychological horror

- do not add supernatural mechanics unless established;
- preserve intended ambiguity;
- ground causality in perception, action, and observable events.

### Folklore-inspired fiction

- distinguish folklore conventions from asserted historical fact;
- preserve central folklore rules;
- permit creative adaptation only within the declared contract.

## Prompt modules

Replace the monolithic prompt builder with composable modules:

```ts
interface PromptModule {
  id: string;
  priority: number;
  estimatedTokens: number;
  required: boolean;
  applies(context: PromptCompilationContext): boolean;
  render(context: PromptCompilationContext): string;
}
```

Create modules for core task, source trust boundary, source cleaning, compact contract, nonfiction evidence boundaries, historical mystery, true crime, documentary, supernatural fiction, psychological fiction, folklore, spoken-language rules, locale-specific rules, dialogue, written-message preservation, exact-time preservation, exact-name preservation, critical-object continuity, opening, ending, response schema, and validation-sensitive rules.

Only include applicable modules. Omit irrelevant written-message, address, dialogue, supernatural, metadata, audio, and duplicate character-map instructions.

## Deduplicated editorial rules

Represent common rules internally through stable IDs and render each applicable rule once:

```ts
type EditorialRuleId =
  | 'remove-meta-commentary'
  | 'spoken-language'
  | 'preserve-facts'
  | 'evidence-speculation-boundary'
  | 'no-invented-dialogue'
  | 'no-invented-internal-thoughts'
  | 'strong-opening'
  | 'concrete-ending'
  | 'preserve-written-messages'
  | 'preserve-exact-identifiers';
```

## Deterministic source cleaning

Before narration generation:

- normalize whitespace and line endings;
- remove generated comments and internal markers;
- remove production-only headings;
- remove metadata sections;
- remove audio-generation instructions;
- remove sound motifs;
- remove visual direction;
- remove thumbnail text and SEO fields;
- identify embedded structural commentary;
- return cleaned source, removed segments, reason codes, and source offsets or segment IDs.

Detect phrases similar to:

- “The repeated detail mattered.”
- “This was the point at which observation replaced disbelief.”
- “The danger became personal.”
- “The plan appeared to work.”
- “The temporary silence created the most dangerous moment.”
- “The false calm allowed the next change.”
- “The final piece of evidence arrived later.”
- “The evidence created a worse problem than disbelief.”
- “The threat had learned.”
- “The incident had responded.”
- references to “the character,” “the protagonist,” or “the survivor” when a named subject should be used.

Use conservative cleaning. Flag ambiguous material instead of silently deleting it.

Persist original source, cleaned source, cleaning report, cleaner version, source hash, and cleaned-source hash.

## Strict narration-only prompts

Canonical story-rewrite and full localization prompts must not include or request:

- episode metadata;
- YouTube titles;
- SEO descriptions;
- tags;
- hashtags;
- thumbnail text;
- content disclosures;
- audio-generation instructions;
- narrator descriptions;
- target voice instructions;
- sound motifs;
- sound-effect labels;
- music instructions;
- scene or image-generation instructions;
- visual direction;
- internal diagnostics;
- validation implementation details;
- repair history.

Add preflight checks that reject narration prompts containing markers such as `Episode Metadata`, `Audio Generation Instructions`, `Suggested thumbnail text`, `Suggested tags`, `Hashtags`, `SEO description`, `Visual direction`, `sound motif`, `narrator`, or `voice instructions`.

Use typed prompt-section ownership, not string matching alone.

## Narration-only response schema

Use a strict internal schema such as:

```ts
interface GeneratedNarration {
  narration: string[];
}
```

Reject unknown properties. If external schemas must remain unchanged, adapt at the boundary and populate metadata/audio later. Use structured outputs where supported. Never reference a supplied schema unless it is actually supplied.

## Compact story contract

Create one compact contract from `StoryIR`. Do not independently inject immutable facts, character map, source analysis, story bible, originality review, and retention plan.

Use deterministic field ordering and do not duplicate premise, threat, reveal, or ending under multiple keys.

# Supported languages and canonical localization flow

The production pipeline generates full stories in exactly:

- English
- Spanish
- German
- Portuguese

Treat this language set as a first-class supported matrix.

## Canonical source policy

The optimized English full story is the canonical narrative artifact.

```text
original English source
  -> optimized canonical English full story
  -> Spanish full localization
  -> German full localization
  -> Portuguese full localization
```

Enforce:

1. Original source is always English.
2. Canonical English rewrite runs first.
3. Abort localization if canonical generation or validation fails.
4. Generate every localized full story directly from final validated canonical English.
5. Never generate Spanish, German, or Portuguese from the raw source, another localization, an incomplete or unvalidated canonical story, a short story, metadata, or audio instructions.
6. Never use one localization as source for another.
7. Preserve one canonical StoryIR and contract across languages.
8. Apply locale-specific wording only in the relevant localization stage.
9. Preserve immutable facts, event order, identities, rules, objects, written messages, climax, and final consequence.
10. Allow natural differences in syntax, paragraphing, idiom, and spoken rhythm.

Add:

```ts
const SUPPORTED_STORY_LANGUAGES = ['en', 'es', 'de', 'pt'] as const;
type SupportedStoryLanguage = typeof SUPPORTED_STORY_LANGUAGES[number];
```

Unsupported languages must fail in preflight with `UNSUPPORTED_STORY_LANGUAGE`.

## Explicit locale configuration

Use explicit locales. Preserve current repository choices. Recommended defaults only when none exist:

```ts
const DEFAULT_STORY_LOCALES = {
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  pt: 'pt-PT',
} as const;
```

Inspect current artifacts before choosing Portuguese. Preserve either `pt-PT` or `pt-BR`; never mix them. Likewise preserve any intentional Spanish locale.

Include locale in StoryIR, prompt context, fingerprints, cache keys, manifests, artifact identity, validation, and telemetry.

## English canonical rewrite

English is a creative rewrite, not a localization call. It must remove contamination, repair coherence, preserve immutable facts, apply genre policy, return narration only, and pass validation before localization.

Use configured values:

```env
MEDIAFORGE_OPENAI_STORY_MODEL=gpt-5.4
MEDIAFORGE_OPENAI_STORY_REASONING_EFFORT=medium
MEDIAFORGE_OPENAI_STORY_MAX_OUTPUT_TOKENS=12000
```

Do not hard-code them.

## Spanish localization

Generate from validated canonical English. Use natural spoken Spanish for the configured locale; avoid literal English syntax and unnecessary loanwords; preserve names, places, facts, rules, evidence boundaries, written messages, climax, and ending; keep pronouns clear; avoid excessive subordinate clauses; and do not add metadata, audio headings, or production notes.

## German localization

Generate from validated canonical English. Use idiomatic spoken German; avoid nominalization, unnecessary passive voice, literal English metaphors, and unnatural compounds; preserve names, places, identifiers, rules, facts, and ending; keep pronouns clear; and do not add metadata, audio headings, or production notes.

## Portuguese localization

Generate from validated canonical English. Use natural spoken Portuguese for the configured variant; never mix `pt-PT` and `pt-BR`; avoid literal English syntax; preserve names, places, identifiers, rules, facts, written messages, climax, and ending; and do not add metadata, audio headings, or production notes.

## Language-specific modules

Create compact modules for:

- `locale-en-US`
- configured Spanish locale
- `locale-de-DE`
- configured Portuguese locale

Each module must contain only locale-unique rules. Universal rules must render once. Exactly one locale module is included per request.

## Localization model configuration

Use:

```env
MEDIAFORGE_OPENAI_LOCALIZATION_MODEL=gpt-5.4
MEDIAFORGE_OPENAI_LOCALIZATION_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_LOCALIZATION_MAX_OUTPUT_TOKENS=10000
```

Never use `gpt-5.4-mini` to generate or regenerate an entire localized full story.

Use mini only for targeted repair:

```env
MEDIAFORGE_OPENAI_REPAIR_MODEL=gpt-5.4-mini
MEDIAFORGE_OPENAI_REPAIR_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_REPAIR_MAX_OUTPUT_TOKENS=2500
```

## Per-language budgeting and validation

Track p50, p90, p95, and maximum successful input/output/reasoning usage separately for English, Spanish, German, and Portuguese.

Until enough telemetry exists, keep the configured `10000` full-localization cap.

Run common validation plus locale-specific checks:

- English: en-US/en-GB consistency, natural spoken English, no template contamination.
- Spanish: no English fragments, correct configured regional vocabulary, natural spoken syntax.
- German: no English fragments, natural syntax, no malformed compounds, clear pronouns.
- Portuguese: no English or Spanish contamination, consistent `pt-PT` or `pt-BR`, natural spoken syntax.

Wrong-language or wrong-locale output is a global failure and must route to full regeneration, not paragraph repair.

## Artifacts

Persist independent artifacts for:

```text
en/full
es/full
de/full
pt/full
```

Adapt to existing conventions. Include source/target language, locale, canonical hashes, StoryIR hash, locale-module version, compiler version, model, reasoning effort, token usage, cost, validation, and repair history.

A canonical English change invalidates all localizations. A locale-module change invalidates only its locale.

## Metadata by language

Generate metadata after each locale's narration passes validation:

- English metadata from English narration;
- Spanish metadata from Spanish narration;
- German metadata from German narration;
- Portuguese metadata from Portuguese narration.

Use:

```env
MEDIAFORGE_OPENAI_METADATA_MODEL=gpt-5.4-mini
MEDIAFORGE_OPENAI_METADATA_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_METADATA_MAX_OUTPUT_TOKENS=3000
```

Metadata failure must not invalidate narration or another locale.

## Audio instructions by language

Resolve audio instructions separately after narration succeeds. Prefer deterministic templates by locale and artifact type. If a model is required, use a dedicated cheap configuration. Audio failure for one locale must not affect narration or other locales.

## Shorts

If shorts are produced in all four languages, derive each from that locale's validated full story:

```text
validated full story for locale -> locale-specific short adaptation
```

Use:

```env
MEDIAFORGE_OPENAI_SHORT_MODEL=gpt-5.4-mini
MEDIAFORGE_OPENAI_SHORT_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_SHORT_MAX_OUTPUT_TOKENS=4000
```

Do not include metadata or audio instructions in short prompts.

## Prompt token budgeting

Estimate tokens before every request and track system, instructions, contract, locale, source, schema, repair context, total input, and output cap.

Add configurable budgets such as:

```env
MEDIAFORGE_STORY_MAX_INSTRUCTION_TOKENS=1500
MEDIAFORGE_STORY_MAX_CONTRACT_TOKENS=1200
MEDIAFORGE_STORY_MAX_TOTAL_INPUT_TOKENS=20000
```

Retain mandatory modules, drop low-priority optional modules first, deduplicate, fail if mandatory content exceeds budget, never truncate JSON, and never arbitrarily truncate source narration.

## Prompt compiler

Create one compiler:

```ts
interface CompiledStoryPrompt {
  systemPrompt: string;
  userPrompt: string;
  selectedModuleIds: string[];
  omittedModuleIds: string[];
  tokenEstimate: {
    system: number;
    instructions: number;
    contract: number;
    locale: number;
    source: number;
    schema: number;
    total: number;
  };
  promptHash: string;
  compilerVersion: string;
  warnings: StoryValidationIssue[];
}
```

It must accept validated StoryIR and cleaned source, select applicable modules, enforce budgets, render narration-only prompts, attach the actual schema, and return a persisted manifest.

## Metadata stage

Metadata runs only after narration validation succeeds. It receives episode ID, language, locale, validated narration or compact summary, immutable series/title data, metadata-specific locale guidance, and strict schema.

It must not receive the story prompt, StoryIR diagnostics, cleaning reports, prompt modules, repair history, audio instructions, or visual planning details.

Metadata failure affects only metadata and remains independently resumable.

## Audio stage

Audio instructions must not be sent to story or localization models. Prefer deterministic resolution. If a model is needed, use a separate cheap model configuration, for example:

```env
MEDIAFORGE_OPENAI_AUDIO_INSTRUCTIONS_MODEL=gpt-5.4-mini
MEDIAFORGE_OPENAI_AUDIO_INSTRUCTIONS_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_AUDIO_INSTRUCTIONS_MAX_OUTPUT_TOKENS=800
```

Do not add this call when deterministic templates are sufficient.

## Correct stage order

```text
source analysis
  -> StoryIR normalization
  -> canonical narration generation
  -> canonical validation and repair
  -> final canonical narration
  -> localized narration generation
  -> localized validation and repair
  -> final localized narration
  -> metadata generation
  -> audio instruction resolution
  -> visual and scene planning
```

## Validation architecture

Run deterministic validation first. Validate schema, non-empty narration, paragraph shape, word range, absence of Markdown/commentary/metadata/audio/visual sections, required names and locations, written messages, ending, duplicate paragraphs, prompt leakage, language consistency, nonfiction invention restrictions, intelligent-threat restrictions, and truncation.

Use semantic validation only when deterministic checks cannot decide correctness.

Validator configuration:

```env
MEDIAFORGE_OPENAI_VALIDATOR_MODEL=gpt-5.4-mini
MEDIAFORGE_OPENAI_VALIDATOR_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_VALIDATOR_MAX_OUTPUT_TOKENS=2000
```

Validator receives only compact contract, relevant paragraph/context, exact question, and strict schema. It must not receive the monolithic generation prompt.

## Repair scopes

```ts
type RepairScope =
  | 'field'
  | 'paragraph'
  | 'paragraph-range'
  | 'opening'
  | 'ending'
  | 'full-regeneration';

type ArtifactOwner =
  | 'narration'
  | 'metadata'
  | 'audio'
  | 'visual-plan';
```

Do not use one generic repair method for every failure.

## Targeted repair

Use the dedicated mini repair model only for fragments. Include locale, issue codes, failed paragraph/field, at most one previous and next paragraph, applicable facts, terminology, exact-message constraints, and strict fragment schema. Return only the repaired fragment.

After repair, replace only the affected content, rerun deterministic validation, optionally rerun semantic validation, cap attempts, and prevent loops.

## Full regeneration routing

Never send a complete story to the targeted repair model.

Full regeneration uses the story or localization model and receives only cleaned source or validated canonical narration, compact contract, relevant locale module, concise global failure list, and strict full-story schema.

Introduce:

```ts
interface RepairRoutingDecision {
  scope: RepairScope;
  modelPurpose: 'repair' | 'story' | 'localization' | 'metadata' | 'audio';
  artifactOwner: ArtifactOwner;
  reason: string;
  affectedParagraphIndexes: number[];
}
```

Route local issues to fragment repair; severe truncation, wrong language, global chronology failure, missing major section, wrong protagonist/genre/setting/threat, or incomplete full story to full regeneration.

## Prevent `max_output_tokens` failures

Detect provider responses equivalent to:

```ts
response.status === 'incomplete' &&
response.incomplete_details?.reason === 'max_output_tokens'
```

Persist request type, locale, repair scope, model, reasoning effort, input/cached/reasoning/visible/total output tokens where available, configured cap, partial response, incomplete reason, attempt number, and cost.

Do not treat token exhaustion as a generic transient error. Do not retry unchanged prompt/model/reasoning/cap/schema.

### Targeted repair exhaustion

Persist partial output, inspect for usable structured fragment, retry at most once with a modestly larger fragment budget, remain fragment-scoped, and never convert to full-story mini repair.

### Full localization exhaustion

Persist incomplete response, classify as global full regeneration, simplify prompt, retry at most once using the localization model, increase full cap only when preflight predicts it is required, and never route to mini repair. Stop after the second failure.

Add typed errors including `OUTPUT_TOKEN_BUDGET_EXHAUSTED` and `FULL_STORY_ROUTED_TO_TARGETED_REPAIR`.

## Dynamic output budgeting

For fragment repair, derive cap from expected visible tokens plus reasoning reserve. For full story/localization, derive expected tokens from target word range, locale token-to-word ratio, locale expansion factor, schema overhead, measured reasoning percentile, and safety margin.

Do not lower full localization caps until telemetry supports it.

## Configuration separation

Use existing config and fallback conventions. Do not hard-code values.

```env
MEDIAFORGE_OPENAI_STORY_MODEL=gpt-5.4
MEDIAFORGE_OPENAI_STORY_REASONING_EFFORT=medium
MEDIAFORGE_OPENAI_STORY_MAX_OUTPUT_TOKENS=12000

MEDIAFORGE_OPENAI_LOCALIZATION_MODEL=gpt-5.4
MEDIAFORGE_OPENAI_LOCALIZATION_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_LOCALIZATION_MAX_OUTPUT_TOKENS=10000

MEDIAFORGE_OPENAI_SHORT_MODEL=gpt-5.4-mini
MEDIAFORGE_OPENAI_SHORT_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_SHORT_MAX_OUTPUT_TOKENS=4000

MEDIAFORGE_OPENAI_REPAIR_MODEL=gpt-5.4-mini
MEDIAFORGE_OPENAI_REPAIR_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_REPAIR_MAX_OUTPUT_TOKENS=2500

MEDIAFORGE_OPENAI_VALIDATOR_MODEL=gpt-5.4-mini
MEDIAFORGE_OPENAI_VALIDATOR_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_VALIDATOR_MAX_OUTPUT_TOKENS=2000

MEDIAFORGE_OPENAI_METADATA_MODEL=gpt-5.4-mini
MEDIAFORGE_OPENAI_METADATA_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_METADATA_MAX_OUTPUT_TOKENS=3000
```

## Deterministic repairs before model calls

Repair locally when possible: Markdown fences, surrounding commentary around valid JSON, whitespace-only paragraphs, duplicate empty paragraphs, calculated fields, known aliases, optional metadata fields, audio headings outside narration, JSON formatting, array normalization, trailing commas, and calculated durations.

## Cost safeguards

Before expensive calls, validate StoryIR, locale, schema, token estimates, output cap, absence of metadata/audio, applicable modules, repair routing, request cost, and remaining budget.

Create stable fingerprints from source hashes, StoryIR hash, locale, task, artifact owner, repair scope, model, reasoning effort, cap, compiler version, and schema version.

Retry only transient failures. Do not retry schema failures, semantic failures, malformed StoryIR, unsupported locale, budget failure, unchanged token exhaustion, deterministic content failure, or repair-scope mismatch.

Add configurable ceilings:

```env
MEDIAFORGE_OPENAI_MAX_STORY_REWRITE_COST_USD=0.30
MEDIAFORGE_OPENAI_MAX_LOCALIZATION_COST_USD=0.20
MEDIAFORGE_OPENAI_MAX_REPAIR_COST_USD=0.03
MEDIAFORGE_OPENAI_MAX_METADATA_COST_USD=0.02
MEDIAFORGE_OPENAI_MAX_EPISODE_TEXT_COST_USD=1.50
```

Failed attempts count toward ceilings. Use centralized versioned pricing.

## Prompt caching compatibility

Keep stable system instructions and static modules first; variable contract, locale data, source, and repair context later. Use deterministic ordering and stable serialization.

## Persistence and observability

Persist equivalent artifacts under current conventions:

```text
story-rewrite/
├── source-original.md
├── source-cleaned.md
├── source-cleaning-report.json
├── analysis-raw.json
├── story-ir.json
├── story-ir-validation.json
├── story-contract.json
├── prompt-manifest.json
├── request-system.txt
├── request-user.txt
├── request.json
├── response-raw.json
├── response-parsed.json
├── deterministic-validation.json
├── semantic-validation.json
├── routing-decision.json
├── cost-report.json
├── repairs/
│   ├── repair-001-request.json
│   ├── repair-001-response.json
│   ├── repair-001-validation.json
│   └── repair-001-cost.json
└── final-story.json
```

Manifest must include versions, hashes, fingerprint, selected/omitted modules, model, reasoning, cap, estimated/actual tokens, cached tokens, reasoning/visible output where available, cost, status, incomplete reason, retries, repairs, and timestamps.

## Usage and cost reporting

Add reporting for cost per successful/failed rewrite, locale, localization, repair, regeneration, metadata, audio, exhaustion frequency, repair success, p50/p90/p95 usage, reasoning tokens, prompt section sizes, cache savings, and failure causes.

## Caching and resume

Cache stable artifacts by content hash and version. Resume must reuse only valid unchanged stages, rerun invalidated downstream stages, reject stale prompts, reject failed responses as successful artifacts, and log reuse/rerun reasons.

## Error handling

Use typed errors including:

- `STORY_IR_SCHEMA_INVALID`
- `STORY_IR_SEMANTICALLY_INVALID`
- `PROMPT_REQUIRED_MODULES_EXCEED_BUDGET`
- `OUTPUT_SCHEMA_UNAVAILABLE`
- `METADATA_FOUND_IN_NARRATION_PROMPT`
- `AUDIO_INSTRUCTIONS_FOUND_IN_NARRATION_PROMPT`
- `GENERATION_RESPONSE_EMPTY`
- `GENERATION_OUTPUT_INVALID`
- `OUTPUT_TOKEN_BUDGET_EXHAUSTED`
- `FULL_STORY_ROUTED_TO_TARGETED_REPAIR`
- `TARGETED_REPAIR_EXHAUSTED`
- `NONFICTION_INVENTION_DETECTED`
- `REQUEST_COST_LIMIT_EXCEEDED`
- `EPISODE_COST_LIMIT_EXCEEDED`
- `IDENTICAL_FAILED_REQUEST_REJECTED`
- `STALE_ARTIFACT_REJECTED`
- `UNSUPPORTED_STORY_LANGUAGE`

Retry only explicitly transient errors.

## Tests

Add unit, regression, integration, and snapshot tests.

Regression fixtures must include:

1. Dyatlov Pass: historical nonfiction, locations correctly typed, hikers as group, critical evidence populated, no supernatural rules, no invented dialogue/thoughts, closing line not factual event, no metadata/audio in narration prompt.
2. Elevator Game: fictional supernatural, rules preserved, dialogue allowed, correct module selection.
3. Black-Eyed Children: folklore-inspired fiction, invitation rule preserved, locale rules retained.
4. Spanish and German full localization exhaustion: global failure, one controlled localization-model regeneration, no mini full-story repair, failed cost counted.
5. Targeted German paragraph exhaustion: remains paragraph-scoped and retries at most once.
6. Metadata failure: narration remains valid.
7. Audio failure: narration remains valid.
8. Deterministic formatting failure: repaired locally without OpenAI.
9. Cost ceiling breach: provider not called.
10. Full language matrix: all localizations derive from validated canonical English; no locale leakage; isolated failures; correct invalidation behavior.

Mock OpenAI in integration tests and verify schemas are actually supplied, deterministic validation precedes semantic validation, full stories never use targeted repair config, incomplete responses persist, unchanged failed requests are not retried, cost ceilings are enforced, and resume reuses only valid artifacts.

## Documentation

Document architecture, StoryIR lifecycle, genre policies, prompt modules, narration-only rules, supported language matrix, canonical English source policy, metadata/audio stages, validation, repair routing, token exhaustion, cost controls, budgeting, caching, resume invalidation, config, adding genres/locales/rules, and troubleshooting.

Include a compact before/after Dyatlov example. Do not include copyrighted full stories.

## Code quality

Use strict TypeScript, no `any`, discriminated unions, exhaustive switches, readonly data where appropriate, focused services, typed errors, deterministic serialization, stable hashes, existing DI/lint/format conventions, minimal justified dependencies, and boundary adapters for compatibility.

## Required deliverables

Complete:

1. Repository analysis.
2. Implementation plan.
3. StoryIR schema and normalizer.
4. Semantic validator.
5. Genre-policy registry.
6. Prompt-module registry.
7. Source cleaner.
8. Compact contract builder.
9. Token-budget service.
10. Narration-only compiler and schema.
11. Deterministic and semantic validation.
12. Repair router and targeted repair.
13. Controlled full regeneration.
14. Metadata service using configured cheap model.
15. Audio resolver/service.
16. Incomplete-response handling.
17. Dynamic output budgeting.
18. Request fingerprinting and retry policy.
19. Cost ceilings and telemetry.
20. Persistence, cache, and resume invalidation.
21. Tests and documentation.
22. Migration notes.
23. Final summary of changed files, decisions, tests, measured prompt reduction, measured cost impact, remaining risks, and follow-up work.

## Acceptance criteria

The work is complete only when:

- canonical and localized story prompts contain narration requirements only;
- no metadata or audio instructions are sent to narration models;
- metadata runs after narration validation using configured metadata model;
- audio is deterministic or separate and cheap;
- metadata/audio failures cannot invalidate narration;
- only one compact contract is injected;
- duplicate analysis artifacts are not independently injected;
- historical nonfiction receives no supernatural instructions;
- fictional supernatural stories retain rule guidance;
- StoryIR errors block expensive requests;
- cleaning output and removals are persisted;
- response schemas are supplied;
- deterministic validation precedes semantic validation;
- targeted repairs operate only on fragments;
- full stories never use targeted repair configuration;
- Spanish and German exhaustion regressions pass;
- token exhaustion is explicitly detected;
- incomplete responses are persisted;
- unchanged exhausted requests are not retried;
- retries are bounded;
- failed attempts count toward cost ceilings;
- over-budget requests fail before contacting OpenAI;
- `.env` remains authoritative;
- CLI commands and external schemas remain compatible;
- supported languages are explicitly English, Spanish, German, and Portuguese;
- English is the only canonical narrative source;
- Spanish, German, and Portuguese always derive from validated canonical English;
- every request has explicit language and locale;
- Portuguese variant is explicit and consistent;
- one locale module is included per prompt;
- locale-independent rules are not duplicated;
- budgeting and telemetry are language-specific;
- metadata and audio are independent per locale;
- failures are isolated by locale and artifact stage;
- all tests, linting, and type checking pass.

Begin by inspecting the repository and documenting the current pipeline. Then implement the refactor end to end without waiting for further confirmation.
