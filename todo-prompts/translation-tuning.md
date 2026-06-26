You are working inside an existing TypeScript-based multilingual YouTube horror-story production repository.

Act as a senior YouTube horror story editor, narrative retention specialist, multilingual localization director, voice-over script producer, and senior TypeScript software architect.

Your domain expertise includes:

- urban legends;
- creepypasta;
- supernatural mysteries;
- haunted technology stories;
- dark documentary narration;
- YouTube retention optimization;
- short-form horror storytelling;
- multilingual localization;
- TTS-ready script production;
- automated scene generation;
- production-grade TypeScript pipelines.

Your responsibility is not merely to translate text.

You must upgrade the existing pipeline so it first turns the supplied English story into an optimized, production-ready English master, then creates a standalone English YouTube Short, then generates and validates all localized long-form and Short versions.

Do not replace the existing architecture unnecessarily.

Inspect the repository first and identify:

- current translation entry points;
- English source loading;
- prompt builders;
- OpenAI or model integration;
- schemas;
- configuration;
- CLI commands;
- episode manifests;
- output directories;
- logging;
- retry handling;
- caching;
- file persistence;
- test tooling;
- TTS generation;
- scene extraction;
- subtitle generation;
- metadata generation;
- video rendering dependencies.

Integrate the new behavior with minimal disruption.

Preserve existing:

- supported languages;
- synchronous translation behavior;
- CLI conventions;
- API behavior;
- file naming;
- manifests;
- output directories;
- logging conventions;
- error handling;
- existing successful production artifacts;

unless a change is required for correctness.

Use strict TypeScript.

Do not introduce `any`.

Do not duplicate configuration values across prompts, validators, CLI handlers, and services.

Do not rely on prompt instructions alone for validation.

Do not trust model-reported word counts or duration estimates.

Do not silently ignore invalid outputs.

Do not translate the raw English source directly.

# Core production objective

The English input is always the full canonical story, but it may still be:

- too short;
- too long;
- synopsis-like;
- template-like;
- weakly paced;
- vague;
- repetitive;
- insufficiently dramatic;
- missing concrete actions;
- weak in viewer retention;
- awkward for spoken narration.

The pipeline must first rewrite the English source into an optimized English master that performs well as a YouTube horror narration.

Every localized version must be translated from that validated optimized English master.

The canonical flow must be:

```text
Raw English story
    ↓
Source analysis
    ↓
Story bible extraction
    ↓
Originality review
    ↓
Scene and retention plan
    ↓
Optimized English long-form master
    ↓
English master validation
    ↓
English master correction loop
    ↓
English YouTube Short adaptation
    ↓
English Short validation
    ↓
English Short correction loop
    ↓
Localized long-form translations
    ↓
Localized standalone Shorts
    ↓
Translation parity validation
    ↓
Localized correction loops
    ↓
TTS generation
    ↓
Actual audio-duration validation
    ↓
Final production reports
```

Do not translate from:

- the raw English source;
- German into Spanish;
- Spanish into French;
- one localized language into another;
- a localized long-form version when generating a Short.

Every long-form translation must derive from the final optimized English master.

Every Short must be semantically grounded in the final optimized English master.

The English Short may be used as structural guidance for pacing, but localized Shorts must not be blindly translated or truncated without checking natural duration and story completeness.

# Relevant editorial persona

Use this persona inside all English optimization and localization prompts:

```text
You are a senior YouTube horror story editor, narrative retention specialist, multilingual localization director, and voice-over script producer.

You specialize in urban legends, creepypasta, supernatural mysteries, haunted technology stories, dark documentary narration, short-form horror, and multilingual YouTube localization.

Act as an editor, not merely as a translator.

Preserve story continuity, plot facts, character relationships, chronology, supernatural rules, recurring motifs, reveals, and ending meaning.

Turn synopsis-like passages into concrete scenes.

Improve viewer retention without empty clickbait.

Write natural spoken narration suitable for TTS, subtitles, scene generation, and video production.

Never sacrifice plot fidelity merely to satisfy word count.

Never add unrelated characters, victims, locations, supernatural rules, lore, subplots, villains, or endings.
```

# Required pipeline stages

Add explicit typed stages:

```ts
export type StoryProductionStage =
  | "raw-source"
  | "source-analysis"
  | "story-bible"
  | "originality-review"
  | "retention-plan"
  | "english-master-generation"
  | "english-master-validation"
  | "english-master-correction"
  | "english-short-generation"
  | "english-short-validation"
  | "english-short-correction"
  | "localized-long-form-generation"
  | "localized-long-form-validation"
  | "localized-short-generation"
  | "localized-short-validation"
  | "tts-generation"
  | "audio-duration-validation"
  | "completed"
  | "failed";
```

Persist the current production stage so interrupted runs can resume safely.

# Video formats

Add typed support for:

```ts
export type TranslationVideoFormat = "long-form" | "short" | "both";
```

When `both` is selected, produce:

- English long-form master;
- English standalone Short;
- localized long-form narration per locale;
- localized standalone Short per locale.

Do not create a Short by truncating the long-form output.

# Story source analysis

Before rewriting, analyze the raw English source for:

- weak hook;
- synopsis-style narration;
- generic template language;
- unresolved placeholders;
- slash-separated alternatives;
- ambiguous alternatives;
- missing concrete actions;
- weak escalation;
- incomplete confrontation;
- weak aftermath;
- weak final sting;
- continuity conflicts;
- unclear chronology;
- inconsistent names;
- inconsistent object terminology;
- incomplete dialogue;
- incomplete on-screen messages;
- unsupported claims;
- repeated exposition;
- insufficient length;
- excessive length;
- derivative similarity to well-known stories.

Examples to flag:

- “a witness or recording appeared”;
- “a sound or object returned”;
- “the protagonist tried a reasonable safety measure”;
- “the threat reacted”;
- “the discovery changed everything”;
- “a trusted voice, memory, or familiar place”;
- “the official account ended there”;
- “events became more disturbing”;
- “something happened”;
- “a contradiction appeared”;
- unresolved brackets;
- incomplete quotes;
- object confusion such as cartridge versus console.

Add:

```ts
export interface StorySourceIssue {
  code:
    | "WEAK_HOOK"
    | "SYNOPSIS_LANGUAGE"
    | "UNRESOLVED_PLACEHOLDER"
    | "AMBIGUOUS_ALTERNATIVE"
    | "MISSING_CONCRETE_ACTION"
    | "CONTINUITY_CONFLICT"
    | "TERMINOLOGY_CONFLICT"
    | "INCOMPLETE_DIALOGUE"
    | "INCOMPLETE_MESSAGE"
    | "WEAK_ESCALATION"
    | "WEAK_CLIMAX"
    | "WEAK_ENDING"
    | "INSUFFICIENT_LENGTH"
    | "EXCESSIVE_LENGTH"
    | "REPETITIVE_EXPOSITION"
    | "ORIGINALITY_RISK";
  severity: "warning" | "error";
  excerpt: string;
  message: string;
  recommendation?: string;
}
```

Do not silently invent major plot details to repair blocking issues.

Persist the source analysis.

# Story bible extraction

Before rewriting, extract and persist a structured story bible.

Add types similar to:

```ts
export interface CharacterDefinition {
  id: string;
  name: string;
  role: string;
  relationships: string[];
  traits: string[];
  requiredFacts: string[];
}

export interface LocationDefinition {
  id: string;
  name: string;
  description: string;
  requiredFacts: string[];
}

export interface ThreatDefinition {
  identity?: string;
  knownCapabilities: string[];
  limitations: string[];
  rules: string[];
  unknowns: string[];
}

export interface TimelineEvent {
  id: string;
  sequenceNumber: number;
  description: string;
  requiredFacts: string[];
  consequence: string;
}

export interface StoryBible {
  title: string;
  premise: string;
  protagonist: CharacterDefinition;
  supportingCharacters: CharacterDefinition[];
  threat: ThreatDefinition;
  locations: LocationDefinition[];
  timeline: TimelineEvent[];
  immutableFacts: string[];
  recurringMotifs: string[];
  supernaturalRules: string[];
  requiredReveals: string[];
  immutableStrings: string[];
  endingMeaning: string;
}
```

The story bible must be generated once, validated, persisted, and injected into:

- English master generation;
- correction prompts;
- English Short generation;
- localization prompts;
- translation parity validation.

The story bible is the semantic source of truth.

# Protected story elements

Add:

```ts
export interface ProtectedStoryElement {
  id: string;
  type: "fact" | "relationship" | "rule" | "reveal" | "motif" | "ending";
  value: string;
  mayRephrase: boolean;
}
```

Use protected story elements to prevent semantic drift while allowing natural rewriting.

# Expansion boundaries

Define:

```ts
export type ExpansionPermission =
  | "source-explicit"
  | "source-implied"
  | "new-plot-material";
```

Rules:

- `source-explicit`: always allowed;
- `source-implied`: allowed only when it clarifies an existing event without changing plot facts;
- `new-plot-material`: prohibited unless explicitly enabled.

Safe implied additions can include:

- checking whether a controller is connected;
- noticing that television volume is muted;
- hesitating before deleting a save file;
- closing curtains after seeing impossible footage;
- examining a physical object already central to the story;
- reacting emotionally to an existing reveal;
- performing a reasonable investigative action already implied by the source.

Prohibited additions include:

- new victims;
- new major characters;
- new siblings;
- secret cults;
- new supernatural rules;
- unrelated locations;
- new timelines;
- different endings;
- new villains;
- unsupported lore;
- additional twists.

# Originality review

Add a structured originality review before rewriting.

```ts
export interface OriginalityReview {
  risk: "low" | "medium" | "high";
  tropeOverlaps: string[];
  distinctiveElements: string[];
  potentiallyDerivativeElements: string[];
  recommendedChanges: string[];
}
```

The review should detect suspicious combinations involving:

- iconic character names;
- famous messages;
- recognizable game mechanics;
- distinctive death backstories;
- known haunted-object patterns;
- famous final lines;
- highly recognizable endings.

Do not reject common horror tropes automatically.

Flag high-risk combinations for review.

Persist the originality review.

Do not automatically rewrite protected names or plot facts unless the project configuration explicitly allows originality adjustments.

# Scene and retention plan

Generate a lightweight internal scene plan from the raw story and story bible.

Add:

```ts
export interface StoryScene {
  id: string;
  sequenceNumber: number;
  purpose:
    | "hook"
    | "setup"
    | "first-anomaly"
    | "investigation"
    | "escalation"
    | "personal-connection"
    | "discovery"
    | "confrontation"
    | "aftermath"
    | "final-sting";
  summary: string;
  requiredFacts: string[];
  immutableStrings: string[];
  targetWordShare?: number;
}

export interface RetentionBeat {
  approximateSecond: number;
  type:
    | "hook"
    | "question"
    | "new-evidence"
    | "contradiction"
    | "escalation"
    | "failed-response"
    | "reveal"
    | "climax"
    | "final-sting";
  description: string;
}
```

A meaningful development should occur approximately every 30–60 seconds.

Do not expose the scene or retention plan inside narration.

Persist it for validation and debugging.

# Scene-level word budgets

Use flexible default shares:

```ts
export const DEFAULT_SCENE_BUDGETS = {
  hook: 0.06,
  setup: 0.12,
  firstAnomaly: 0.12,
  escalation: 0.18,
  investigation: 0.16,
  personalConnection: 0.12,
  confrontation: 0.16,
  aftermathAndSting: 0.08,
} as const;
```

These are guidelines, not hard quotas.

Flag:

- setup above roughly 25%;
- climax below roughly 10%;
- no meaningful event in the middle third;
- final reveal occurring too early;
- excessive exposition before the first anomaly.

# English master generation

The English master must be rewritten before translation.

The rewrite must preserve:

- protagonist;
- supporting characters;
- relationships;
- chronology;
- central threat;
- supernatural rules;
- recurring motifs;
- cause and effect;
- major discoveries;
- technical facts relevant to the plot;
- emotional connection;
- climax;
- aftermath;
- final implication.

The rewrite may improve:

- hook;
- pacing;
- scene clarity;
- sentence structure;
- spoken flow;
- transitions;
- sensory detail;
- emotional reactions;
- suspense;
- viewer retention;
- paragraph structure;
- scene emphasis.

The rewrite must not alter:

- who performs an action;
- the central supernatural mechanism;
- character identities;
- the outcome;
- the ending meaning;
- protected story elements.

The English optimization prompt must include:

```text
Rewrite the supplied English horror story into a production-ready YouTube narration.

This is not a summary, outline, synopsis, review, or translation.

Preserve the complete story, its characters, chronology, rules, reveals, emotional relationships, climax, aftermath, and final meaning.

Improve it for viewer retention, spoken narration, scene extraction, TTS, subtitles, and image generation.

Replace abstract or template-like statements with concrete scenes.

Do not say that a safety measure failed. State exactly what the character disconnected, deleted, locked, examined, isolated, recorded, or destroyed, and exactly how the threat responded.

Do not say that a recording appeared. State who created it, what it showed, when it was viewed, and what contradiction it introduced.

Do not say that the situation escalated. Narrate the event that increased the danger.

Do not use empty retention phrases.

Do not introduce new characters, victims, locations, supernatural rules, lore, subplots, villains, or endings.

Use only source-explicit or safely source-implied details.

Return one definitive production-ready narration.
```

# YouTube hook requirements

The first 1–3 sentences must contain the strongest:

- impossible detail;
- contradiction;
- threat;
- discovery;
- message;
- visual image;
- or unresolved question.

Do not begin with:

- general commentary about horror stories;
- long biography;
- broad urban-legend explanation;
- production context;
- multiple paragraphs of background.

The hook should usually occupy about 40–100 words.

After the hook, briefly return to ordinary reality before escalating.

# Retention requirements

Every 30–60 seconds should introduce at least one:

- new piece of evidence;
- contradiction;
- altered detail;
- failed safety measure;
- personal connection;
- stronger manifestation;
- decision;
- consequence;
- reveal;
- reinterpretation of an earlier clue.

Do not repeat the same scare without increasing its meaning or consequence.

Avoid phrases such as:

- “But what happened next was even worse.”
- “He had no idea what was coming.”
- “Things were about to become terrifying.”
- “What happened next changed everything.”

Use concrete event-based transitions.

# Show, do not summarize

Bad:

```text
The next incident removed some of that comfort.
```

Good:

```text
Felix restarted the console. The original save file was gone. In its place were two new files: BEN and FELIX.
```

Bad:

```text
He attempted a reasonable safety measure.
```

Good:

```text
Felix unplugged the controller, disconnected the console from the television, and removed the cartridge. The character continued walking across the screen.
```

Bad:

```text
The threat used a familiar memory.
```

Good:

```text
The television showed Felix’s younger brother standing behind him.
```

Do not preserve vague source language when enough information exists elsewhere in the source to make it concrete.

When the source lacks sufficient information:

- flag the issue;
- preserve the safest interpretation;
- mark the artifact as requiring review when necessary.

# Long-form duration and word-count rules

Support exact target durations from 6 to 11 minutes.

Use centralized typed configuration.

```ts
export const LONG_FORM_WORD_RANGES = {
  6: { preferredMin: 950, preferredMax: 1_080 },
  7: { preferredMin: 1_120, preferredMax: 1_260 },
  8: { preferredMin: 1_280, preferredMax: 1_440 },
  9: { preferredMin: 1_450, preferredMax: 1_620 },
  10: { preferredMin: 1_620, preferredMax: 1_800 },
  11: { preferredMin: 1_780, preferredMax: 1_980 },
} as const;
```

Use the exact-duration range when target minutes are supplied.

When no exact duration is supplied:

- preserve the current configured default when one exists;
- otherwise default to 10 minutes;
- do not use 1,600–1,900 words for every 6–11 minute video.

For a 10-minute default:

```ts
{
  targetMinutes: 10,
  preferredMinWords: 1_620,
  preferredMaxWords: 1_800,
  hardMinWords: 1_550,
  hardMaxWords: 1_900,
}
```

The preferred range is the primary target.

The hard range is only a tolerance boundary.

# YouTube Short rules

Generate the English Short only after the optimized English master passes validation.

Default 60-second target:

```ts
{
  preferredMinWords: 150,
  preferredMaxWords: 170,
  hardMinWords: 140,
  hardMaxWords: 180,
}
```

The Short must contain:

1. immediate hook;
2. minimal concrete setup;
3. at least one specific escalation;
4. an attempted response, discovery, or failure;
5. final twist, warning, image, or message.

The Short must not be:

- only an introduction;
- a trailer;
- a synopsis;
- a list of events;
- the first 60 seconds of the long-form story;
- a mechanically truncated script.

Do not spend more than approximately 20% on background.

Begin with the strongest impossible detail.

End with the strongest final reveal.

Prefer 150–170 words.

Allow 171–180 only when necessary to preserve a complete narrative arc.

Retry or fail output above 180 words.

Retry output below 140 words unless the configured Short target is below 60 seconds.

# Localization stage

Translate long-form versions only from the validated English master.

Generate localized Shorts from the validated English master, using the English Short as pacing guidance only.

Each localized version must preserve:

- all required scenes;
- chronology;
- character relationships;
- supernatural rules;
- protected facts;
- recurring motifs;
- required reveals;
- ending meaning;
- immutable strings.

The localization prompt must explicitly state:

```text
Produce a complete localized narration, not a summary, synopsis, outline, review, or abbreviated retelling.

Preserve every meaningful event, concrete action, discovery, warning, contradiction, recurring detail, technical fact, emotional beat, climax, aftermath, and final reveal from the optimized English master.

Do not replace concrete scenes with abstract phrases.

State exactly what the character saw, heard, opened, deleted, disconnected, examined, recorded, isolated, or destroyed, and exactly how the threat responded.

Write natural, idiomatic spoken language for native speakers.

Do not preserve awkward English sentence structure.

Do not confuse related physical objects.

Return one definitive production-ready localization.
```

# Terminology consistency

Add a per-language terminology glossary.

At minimum preserve distinctions such as:

- game cartridge versus game console;
- save file versus cartridge;
- television versus monitor;
- controller versus console;
- folder versus file;
- recording versus live feed;
- nickname versus legal name.

Persist terminology decisions per language.

Inject them into retry prompts.

# Immutable strings

Support exact immutable strings.

Example:

```ts
const immutableStrings = ["CONTINUE?", "BEN HAS ALREADY LEFT."];
```

Validate character-for-character equality.

Do not translate, reformat, capitalize, punctuate, or normalize immutable strings.

Missing or altered immutable strings must trigger correction or failure.

Do not include production instructions such as “keep exactly as written” inside spoken narration.

# Locale narration profiles

Add:

```ts
export interface LocaleNarrationProfile {
  locale: string;
  preferredWpm: number;
  pauseFactor: number;
  shortCompressionFactor: number;
  longFormExpansionFactor: number;
}
```

Do not force identical word counts across languages.

Prioritize actual spoken duration and semantic parity.

Use sensible defaults and allow project configuration overrides.

# Central configuration

Add a centralized typed configuration similar to:

```ts
export interface StoryProductionConfig {
  targetWpm: number;
  pauseFactor: number;

  longForm: {
    targetMinutes: 6 | 7 | 8 | 9 | 10 | 11;
    preferredMinWords: number;
    preferredMaxWords: number;
    hardMinWords: number;
    hardMaxWords: number;
  };

  short: {
    targetSeconds: 30 | 45 | 60;
    preferredMinWords: number;
    preferredMaxWords: number;
    hardMinWords: number;
    hardMaxWords: number;
  };

  optimization: {
    optimizeEnglishMaster: boolean;
    generateEnglishShort: boolean;
    allowSafeSceneExpansion: boolean;
    performOriginalityReview: boolean;
    generateStoryBible: boolean;
    generateRetentionPlan: boolean;
  };

  correction: {
    maxEnglishMasterAttempts: number;
    maxEnglishShortAttempts: number;
    maxTranslationAttempts: number;
    maxApiRetryAttempts: number;
  };

  validation: {
    validateSceneParity: boolean;
    validateTerminology: boolean;
    validateImmutableStrings: boolean;
    validateNarratorReadability: boolean;
    validateAudioDuration: boolean;
  };
}
```

Provide safe defaults:

```ts
export const DEFAULT_STORY_PRODUCTION_CONFIG: StoryProductionConfig = {
  targetWpm: 180,
  pauseFactor: 1.075,

  longForm: {
    targetMinutes: 10,
    preferredMinWords: 1_620,
    preferredMaxWords: 1_800,
    hardMinWords: 1_550,
    hardMaxWords: 1_900,
  },

  short: {
    targetSeconds: 60,
    preferredMinWords: 150,
    preferredMaxWords: 170,
    hardMinWords: 140,
    hardMaxWords: 180,
  },

  optimization: {
    optimizeEnglishMaster: true,
    generateEnglishShort: true,
    allowSafeSceneExpansion: true,
    performOriginalityReview: true,
    generateStoryBible: true,
    generateRetentionPlan: true,
  },

  correction: {
    maxEnglishMasterAttempts: 2,
    maxEnglishShortAttempts: 2,
    maxTranslationAttempts: 2,
    maxApiRetryAttempts: 3,
  },

  validation: {
    validateSceneParity: true,
    validateTerminology: true,
    validateImmutableStrings: true,
    validateNarratorReadability: true,
    validateAudioDuration: true,
  },
};
```

Allow existing configuration, CLI arguments, or episode manifests to override defaults.

# Deterministic word counting

Implement:

```ts
export function countNarrationWords(text: string, locale: string): number;
```

Requirements:

- count only spoken narration;
- ignore headings;
- ignore metadata;
- ignore reports;
- ignore production notes;
- ignore Markdown fences;
- use `Intl.Segmenter` where possible;
- provide deterministic fallback;
- document limitations for non-whitespace languages;
- test supported locales.

Do not trust model-reported counts.

# Duration calculation

Implement:

```ts
export function estimateNarrationDuration(
  wordCount: number,
  targetWpm: number,
  pauseFactor = 1.075
): {
  baseSeconds: number;
  estimatedWithPausesSeconds: number;
};
```

Do not rely on the model’s estimate.

# Narrator-readability validation

Validate:

- sentences over 35–40 words;
- paragraphs over 120–150 words;
- unclear pronouns;
- awkward abbreviations;
- excessive nested clauses;
- accidental reading of headings;
- unexplained acronyms;
- repeated sentence openings;
- tongue-twisting wording;
- unclear dialogue or screen text.

Normalize dates and times for speech where appropriate.

Keep immutable screen text unchanged.

# Repetition detection

Flag:

- repeated phrase more than twice;
- too many sentences beginning with the protagonist’s name;
- repeated paragraph cadence;
- repeated emotional reaction without escalation;
- overuse of phrases such as:

  - “for a moment”;
  - “seconds later”;
  - “he froze”;
  - “something was wrong”;
  - “the room fell silent”;
  - “but that was impossible.”

Use weighted heuristics rather than exact one-phrase rejection.

# Synopsis detection

Add weighted synopsis detection.

Signals include:

- excessive abstract event labels;
- too few paragraphs compared with source scenes;
- missing quoted messages;
- missing physical actions;
- missing failed safety measures;
- severe compression;
- generic phrases such as:

  - “the situation escalated”;
  - “the next incident”;
  - “the protagonist tried a measure”;
  - “the threat reacted”;
  - “the discovery changed everything”;
  - “events followed”;
  - “the official account ended.”

Return clear reasons.

# Scene and semantic parity validation

Add:

```ts
export interface StoryParityResult {
  missingFacts: string[];
  changedFacts: string[];
  inventedFacts: string[];
  weakenedReveals: string[];
  missingSceneIds: string[];
  endingEquivalent: boolean;
}
```

Validate translations against:

- story bible;
- protected story elements;
- scene manifest;
- optimized English master.

Do not validate only by word count.

# Quality scoring

Add a qualitative model-assisted score:

```ts
export interface StoryQualityScore {
  hook: number;
  clarity: number;
  sceneSpecificity: number;
  escalation: number;
  emotionalConnection: number;
  originality: number;
  climax: number;
  ending: number;
  voiceOverReadability: number;
  overall: number;
}
```

Use deterministic validation for hard failures.

Use model scoring only as a qualitative signal.

Do not allow the model score to override deterministic failures.

# Validation result types

Add:

```ts
export interface StoryValidationFailure {
  code: string;
  message: string;
  excerpt?: string;
  expected?: string;
  actual?: string;
}

export interface StoryValidationResult {
  valid: boolean;
  productionReady: boolean;
  withinPreferredWordRange: boolean;
  withinHardWordRange: boolean;
  estimatedDurationSeconds: number;
  estimatedDurationWithPausesSeconds: number;
  missingSceneIds: string[];
  failures: StoryValidationFailure[];
  warnings: string[];
  correctionAttempts: number;
}
```

Localized output schema:

```ts
export interface LocalizedStoryResult {
  language: string;
  locale: string;
  format: "long-form" | "short";
  narration: string;
  sourceWordCount: number;
  localizedWordCount: number;
  targetMinWords: number;
  targetMaxWords: number;
  estimatedDurationSeconds: number;
  estimatedDurationWithPausesSeconds: number;
  scenesPreserved: boolean;
  immutableStringsVerified: boolean;
  terminologyConsistent: boolean;
  parity: StoryParityResult;
  validation: StoryValidationResult;
}
```

# Correction loops

Use separate bounded correction loops for:

- English master quality;
- English master length;
- English Short;
- localized long-form;
- localized Short;
- transient API failures.

API retries and content correction retries must be independent.

Suggested defaults:

```ts
{
  maxEnglishMasterCorrectionAttempts: 2,
  maxEnglishShortCorrectionAttempts: 2,
  maxTranslationCorrectionAttempts: 2,
  maxApiRetryAttempts: 3,
}
```

Correction prompts must state exact defects.

Example for synopsis-like English master:

```text
The rewritten English narration still contains synopsis-style passages.

Problematic excerpts:
- “The situation escalated.”
- “A reasonable safety measure failed.”
- “The discovery changed everything.”

Rewrite those sections as concrete scenes using only facts supported by the source and story bible.

Preserve names, chronology, rules, protected elements, and ending.

Return the complete corrected narration.
```

Example for insufficient long-form length:

```text
The English master contains 1,384 words.
The preferred range is 1,620–1,800 words.

Expand underdeveloped existing scenes.

Prioritize:
- physical actions;
- investigation;
- sensory details;
- failed safety measures;
- confrontation;
- aftermath.

Do not add new characters, locations, rules, lore, subplots, or endings.

Return the complete corrected narration.
```

Example for excessive Short length:

```text
The Short contains 191 words.
The hard maximum is 180 words.

Reduce it to 150–170 words.

Preserve:
- opening hook;
- protagonist;
- central threat;
- one concrete escalation;
- attempted response;
- final twist.

Remove redundant setup and abstract explanation.

Return the complete corrected Short.
```

Prefer targeted correction over full regeneration.

# TTS duration validation

After TTS generation, use `ffprobe` or the repository’s existing media tooling to measure actual audio duration.

Add:

```ts
export interface AudioDurationValidation {
  expectedSeconds: number;
  actualSeconds: number;
  differenceSeconds: number;
  withinTolerance: boolean;
}
```

Suggested tolerances:

- Short: ±3 seconds;
- 6–8 minute video: ±20 seconds;
- 9–11 minute video: ±30 seconds.

Actual audio duration is the final source of truth.

If audio is too long:

- do not excessively speed up narration;
- shorten the script through targeted correction;
- regenerate TTS.

If audio is too short:

- deepen existing scenes only;
- regenerate TTS.

Do not add unrelated padding.

# Persistence

Persist all important artifacts.

Adapt to existing directory conventions where possible.

Suggested structure:

```text
episode/
  source/
    story.raw.en.md
    source-analysis.json
    story-bible.json
    originality-review.json
    retention-plan.json

  master/
    story.master.en.md
    story.master.en.report.json
    story.short.en.md
    story.short.en.report.json
    scenes.master.en.json

  localized/
    de-DE/
      story.long.md
      story.long.report.json
      story.short.md
      story.short.report.json

    es-ES/
      story.long.md
      story.long.report.json
      story.short.md
      story.short.report.json
```

Persist:

- source hash;
- master hash;
- prompt version;
- model;
- source issues;
- story bible;
- originality review;
- retention plan;
- word counts;
- estimated duration;
- actual audio duration;
- retries;
- validation failures;
- warnings;
- terminology decisions;
- immutable-string status;
- parity results;
- production-ready status;
- timestamps.

Do not overwrite successful outputs unless:

- `--force` is used;
- source hash changed;
- prompt version changed;
- configuration changed;
- dependent master changed;
- or existing project behavior explicitly permits it.

# Caching and invalidation

Reuse a validated English master when:

- source hash matches;
- prompt version matches;
- configuration hash matches;
- story bible version matches.

Invalidate dependent outputs when:

- raw English source changes;
- optimized master changes;
- story bible changes;
- target duration changes;
- locale profile changes;
- immutable strings change;
- terminology glossary changes;
- prompt version changes.

# CLI integration

Integrate with current CLI conventions.

Possible options:

```text
--optimize-english-master
--skip-english-optimization
--video-format long-form|short|both
--target-minutes 6|7|8|9|10|11
--short-seconds 30|45|60
--target-wpm 180
--allow-safe-scene-expansion
--perform-originality-review
--max-master-correction-attempts 2
--max-short-correction-attempts 2
--max-translation-correction-attempts 2
--force
```

Default to optimized English master generation.

`--skip-english-optimization` should exist only for backward compatibility or debugging and must emit a warning.

Validate incompatible arguments clearly.

# Logging and observability

Use the existing logger and correlation IDs.

Log structured events for:

- source analysis started/completed;
- story bible generated;
- originality review completed;
- retention plan generated;
- English master generation;
- English validation;
- correction attempt;
- English Short generation;
- translation generation;
- parity validation;
- immutable-string failure;
- word count;
- estimated duration;
- actual audio duration;
- production-ready status;
- artifact persistence.

Do not log the full story by default.

Include:

- episode ID;
- locale;
- format;
- stage;
- model;
- prompt version;
- source hash;
- master hash;
- word count;
- duration;
- retry number;
- validation status.

# Error handling

Use typed errors.

Examples:

```ts
export class StorySourceValidationError extends Error {}
export class EnglishMasterValidationError extends Error {}
export class TranslationValidationError extends Error {}
export class ImmutableStringValidationError extends Error {}
export class StoryParityValidationError extends Error {}
export class AudioDurationValidationError extends Error {}
```

Do not swallow:

- API errors;
- parsing errors;
- schema errors;
- filesystem errors;
- validation failures;
- TTS failures;
- ffprobe failures.

Keep transient API retry logic separate from content correction.

# Tests

Add comprehensive tests using existing repository tooling.

Cover at minimum:

1. raw English source is not translated directly;
2. story bible is generated first;
3. optimized English master is generated before localization;
4. localized outputs use the optimized master;
5. English master within preferred range;
6. English master below hard minimum;
7. English master above hard maximum;
8. duration mapping for 6–11 minutes;
9. weak hook detection;
10. synopsis-language detection;
11. safe implied expansion;
12. prevention of new plot material;
13. originality review output;
14. retention plan generation;
15. scene-budget warning;
16. English Short within 150–170 words;
17. English Short between 171–180 words;
18. English Short above 180 words;
19. English Short below 140 words;
20. Short has complete narrative arc;
21. immutable strings preserved;
22. immutable strings altered;
23. terminology conflict;
24. cartridge versus console distinction;
25. repetition detection;
26. narrator-readability checks;
27. scene parity success;
28. missing-scene detection;
29. invented-fact detection;
30. changed-ending detection;
31. correction-loop success;
32. correction-loop exhaustion;
33. API retries separate from content corrections;
34. story-bible caching;
35. source-hash invalidation;
36. prompt-version invalidation;
37. config-hash invalidation;
38. actual audio-duration validation;
39. `both` mode output;
40. backward-compatible translation-only mode;
41. report persistence;
42. existing behavior remains compatible.

Add unit, integration, and focused end-to-end tests where appropriate.

# Documentation

Update the relevant README or production documentation.

Document:

- full production flow;
- why English is optimized before translation;
- persona and editorial responsibilities;
- story bible;
- protected elements;
- originality review;
- retention planning;
- duration targets;
- preferred and hard word-count boundaries;
- safe expansion rules;
- localization parity;
- actual audio-duration validation;
- correction loops;
- caching and invalidation;
- output files;
- configuration;
- CLI examples;
- production-ready status;
- known limitations.

# Implementation constraints

- Use strict TypeScript.
- Do not use `any`.
- Reuse existing services and abstractions.
- Keep source analysis, story bible generation, prompt construction, model calls, validation, correction, persistence, and TTS validation separate.
- Prefer small, composable functions.
- Avoid unnecessary dependencies.
- Add inline documentation where behavior is non-obvious.
- Preserve existing logging and error-handling patterns.
- Preserve synchronous translation behavior.
- Do not break existing episode outputs.
- Do not depend on model-reported word counts.
- Do not depend on model-reported duration.
- Do not rely on persona wording as the only quality control.
- Use deterministic validation for hard constraints.
- Use model-based semantic validation only where deterministic validation is insufficient.

# Required final implementation report

After implementation, provide:

1. existing pipeline discovered;
2. new end-to-end architecture;
3. files changed;
4. new types and schemas;
5. configuration added;
6. English master optimization behavior;
7. story bible behavior;
8. originality review behavior;
9. retention planning;
10. Short adaptation behavior;
11. localization behavior;
12. parity validation;
13. correction loops;
14. TTS duration validation;
15. caching and invalidation;
16. tests added;
17. commands to run;
18. backward-compatibility notes;
19. remaining risks and limitations.

Do not stop after analysis.

Implement the changes, update tests and documentation, run the relevant checks, and report any failures honestly.
