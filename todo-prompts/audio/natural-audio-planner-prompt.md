You are a senior TypeScript architect working inside an existing production-grade story-to-video automation repository.

Your task is to inspect the current codebase and create a detailed implementation plan for improving the naturalness, distinctiveness, and emotional quality of generated narration while continuing to use OpenAI TTS exclusively.

Do not implement the changes yet.

## Primary objective

The current narration sounds like a recognizable, generic AI-generated YouTube voice. Plan an architecture that makes the narration sound more human, less repetitive, better paced, and more appropriate for long-form and short-form horror storytelling.

The solution must:

- use OpenAI TTS only;
- not introduce ElevenLabs, PlayHT, Azure Speech, Google TTS, Amazon Polly, local voice models, voice cloning services, or any other commercial or external speech engine;
- preserve the existing story-to-video workflow;
- support English and all currently supported localized languages;
- work for both full videos and Shorts;
- remain deterministic and auditable where practical;
- support batch processing;
- allow individual language or TTS jobs to fail without blocking unrelated successful outputs;
- avoid unnecessarily increasing OpenAI token or audio-generation costs;
- remain compatible with the repository’s existing CLI, configuration, artifact, logging, validation, and batch-processing conventions.

## Important working instructions

Before proposing changes:

1. Inspect the repository thoroughly.
2. Identify the current TTS entry points, services, CLI commands, schemas, configuration, prompts, artifact paths, audio-processing utilities, retry handling, batch orchestration, and validation logic.
3. Search for all OpenAI audio and speech API calls.
4. Identify whether narration is currently generated:

   - as one complete story;
   - per paragraph;
   - per scene;
   - per sentence;
   - or through another chunking strategy.

5. Inspect how speed, voice, model, instructions, language, retries, timeouts, output format, and pronunciation are currently configured.
6. Inspect all FFmpeg or audio post-processing logic.
7. Identify deprecated, duplicated, bypassed, or obsolete TTS paths.
8. Reuse existing abstractions where they are sound.
9. Do not invent replacement subsystems when an existing module can be extended safely.

Base every recommendation on evidence found in the codebase. Include concrete file paths, symbols, commands, schemas, and call flows.

## Required target architecture

Plan a staged narration pipeline similar to:

```text
localized story
  → spoken-language adaptation
  → narrative beat segmentation
  → performance-direction planning
  → TTS chunk generation with neighboring context
  → chunk-level technical validation
  → continuity-aware audio assembly
  → final mastering
  → narration quality gate
  → downstream video rendering
```

Adapt this architecture to the repository rather than forcing it blindly.

## 1. Spoken-language adaptation

Plan a preprocessing stage that converts written story prose into text optimized for spoken narration.

It should improve:

- sentence-length variation;
- conversational phrasing;
- natural contractions where appropriate;
- deliberate sentence fragments;
- paragraph rhythm;
- pronunciation;
- transitions between narrative beats;
- emphasis placement;
- pause opportunities;
- narration clarity.

It must avoid:

- changing story facts;
- weakening the hook;
- altering names or important details;
- adding unsupported events;
- excessive ellipses;
- fake stuttering;
- random filler words;
- melodramatic horror clichés;
- repetitive sentence fragments;
- turning every sentence into an exaggerated dramatic line.

Determine whether this step should:

- reuse an existing rewrite/localization request;
- extend an existing narration-preparation stage;
- or become a separate optional artifact and command.

Recommend the safest approach.

The adapted narration text must be persisted as a reviewable artifact and must not silently overwrite the canonical localized story.

## 2. Narrative beat segmentation

Plan deterministic segmentation of the adapted narration into coherent performance chunks.

Target approximately 15–40 seconds of generated speech per chunk, but do not rely only on character count.

Chunk boundaries should prefer:

- paragraph boundaries;
- changes in narrative purpose;
- changes in emotional state;
- transitions between setup, escalation, reveal, and aftermath;
- scene boundaries where appropriate.

Avoid:

- sentence-by-sentence TTS;
- very long monolithic generations;
- splitting names, quotations, or tightly connected sentences;
- chunks too short to establish a stable delivery;
- chunks so long that emotional direction becomes ineffective.

The plan must define:

- segmentation inputs;
- deterministic heuristics;
- configurable duration or word-count budgets;
- minimum and maximum chunk sizes;
- fallback behavior;
- stable chunk identifiers;
- ordering guarantees;
- artifact schema;
- resumability;
- invalidation rules when narration text changes.

## 3. Performance-direction planning

Design a typed, versioned schema for section- and chunk-level delivery instructions.

A possible starting point is:

```ts
type NarrationMood =
  | "neutral"
  | "curious"
  | "uneasy"
  | "urgent"
  | "intimate"
  | "disturbed"
  | "reflective";

type NarrationPace = "slow" | "measured" | "normal" | "fast";

interface NarrationDirection {
  readonly mood: NarrationMood;
  readonly pace: NarrationPace;
  readonly intensity: number;
  readonly pauseBeforeMs: number;
  readonly pauseAfterMs: number;
  readonly emphasisWords: readonly string[];
  readonly deliveryNote: string;
}
```

Do not adopt this schema blindly. Improve it where required.

The schema should support:

- hook;
- setup;
- discovery;
- escalation;
- climax;
- reveal;
- aftermath;
- closing line.

It should also support:

- intended pace;
- emotional intensity;
- restraint level;
- emphasis targets;
- pause intent;
- continuity from the previous chunk;
- whether the chunk ends conclusively or flows into the next;
- pronunciation hints where OpenAI TTS can benefit from textual guidance;
- negative delivery constraints.

Example negative constraints include:

- no movie-trailer voice;
- no radio-announcer cadence;
- no upbeat explainer tone;
- no exaggerated suspense;
- no identical emphasis on every sentence;
- no dramatic pause after every clause;
- no constant breathiness;
- no sing-song sentence endings.

Determine whether performance directions should be:

- generated by OpenAI;
- derived deterministically from story structure;
- produced through a hybrid system;
- or inherited from existing scene or story analysis artifacts.

Prefer a hybrid approach where deterministic defaults remain usable if AI planning fails.

## 4. OpenAI TTS request architecture

Plan improvements to the existing OpenAI TTS integration without introducing another provider.

The plan must inspect and account for the exact OpenAI SDK and API usage already present in the repository.

Design requests so that each chunk receives:

- the current chunk text;
- the previous sentence or short previous-context excerpt;
- the next sentence or short next-context excerpt;
- the chunk’s narrative role;
- the intended emotional direction;
- pace and intensity;
- explicit negative style constraints;
- language and locale;
- voice selection;
- continuity guidance.

Only the current chunk should be synthesized.

Do not synthesize the contextual text into the output.

Determine how to express context safely using the OpenAI API capabilities available in the repository. If the API cannot separate non-spoken context cleanly from spoken text, propose a safe prompt/instruction structure and document its limitations.

Plan configuration for:

- model;
- voice;
- output format;
- speed;
- timeout;
- retries;
- concurrency;
- batch mode;
- per-language overrides;
- full-video versus Short defaults;
- fallback voice;
- fallback instruction profile;
- deterministic config snapshots.

Do not hard-code a single voice assumption. Plan a controlled OpenAI-only voice evaluation mechanism.

## 5. OpenAI voice evaluation

Plan a benchmark command that compares available configured OpenAI voices using the same standardized narration test passage.

The benchmark passage should include:

- an immediate hook;
- calm exposition;
- a proper name;
- a date or number;
- a quiet realization;
- an urgent line;
- a restrained reveal;
- a final unsettling sentence.

The command should generate anonymous or randomized comparison outputs to reduce evaluator bias.

Persist:

- voice;
- model;
- instructions;
- speed;
- language;
- generation timestamp;
- source hash;
- audio duration;
- output path;
- evaluation scores.

Suggested subjective scoring categories:

- naturalness;
- distinctiveness;
- emotional appropriateness;
- pronunciation;
- continuity;
- listener fatigue;
- generic-AI recognizability.

Plan support for selecting a default voice:

- globally;
- per language;
- per channel;
- per story format;
- or per narration profile.

Do not automatically rotate voices within one story.

## 6. Chunk generation, caching, and resumability

Plan chunk-level generation with stable fingerprints based on all materially relevant inputs, including:

- narration text;
- OpenAI model;
- voice;
- speed;
- language;
- instructions;
- performance direction;
- context excerpts;
- output format;
- schema or prompt version.

A chunk must regenerate when any relevant input changes.

A chunk must be reusable when its complete fingerprint remains unchanged.

Plan:

- concurrency limits;
- API rate-limit handling;
- retry classification;
- exponential backoff;
- timeout handling;
- partial completion;
- resume behavior;
- failed chunk reporting;
- batch status;
- cleanup of stale artifacts;
- atomic writes;
- temp-file handling;
- idempotency.

A single failed chunk should not corrupt or overwrite a previously valid completed narration.

## 7. Technical audio validation

Plan local validation for every generated chunk before assembly.

At minimum, consider:

- file existence;
- decodability;
- non-zero duration;
- expected duration range;
- silence percentage;
- clipping;
- true-peak threshold;
- RMS or loudness anomalies;
- unexpected leading or trailing silence;
- channel count;
- sample rate;
- malformed containers;
- extremely short output;
- unexpectedly long output.

Where practical, compare expected narration length against measured duration using language-aware words-per-minute ranges.

Classify validation findings as:

- error;
- warning;
- informational.

Do not reject useful audio solely because it deviates slightly from a duration estimate.

## 8. Pronunciation validation and overrides

Plan a pronunciation mechanism for:

- character names;
- place names;
- foreign terms;
- abbreviations;
- dates;
- numbers;
- acronyms.

Because the solution must remain OpenAI-TTS-only, do not depend on SSML unless the currently used OpenAI API explicitly supports the required feature.

Prefer a configurable text-normalization and pronunciation dictionary that can transform only the TTS input while preserving the displayed canonical story.

The plan should define:

- global pronunciation entries;
- language-specific entries;
- episode-specific overrides;
- collision handling;
- safe replacement boundaries;
- audit logging;
- review artifacts.

Do not use naive unrestricted string replacement.

## 9. Audio continuity and assembly

Plan continuity-aware assembly of generated chunks using existing audio tooling where possible.

Address:

- timbre discontinuities;
- volume differences;
- abrupt silence;
- clipped chunk boundaries;
- inconsistent leading and trailing pauses;
- unnatural room-tone changes;
- missing chunks;
- duplicated chunks;
- incorrect ordering.

Plan configurable:

- silence trimming;
- minimum retained boundary silence;
- pause insertion from performance metadata;
- equal-power crossfades;
- chunk concatenation;
- final normalization;
- output verification.

Avoid crossfades that overlap spoken words or remove intentional pauses.

The assembler must consume an explicit ordered manifest rather than relying on filesystem filename ordering.

## 10. Final mastering

Plan a conservative local mastering chain using FFmpeg or existing repository tools.

A reasonable conceptual chain may include:

```text
high-pass filtering
→ gentle corrective EQ
→ light compression
→ optional subtle saturation
→ de-essing when required
→ loudness normalization
→ true-peak limiting
```

Do not apply aggressive effects by default.

Plan separately configurable profiles for:

- clean narration master;
- narration used in the final mix;
- Shorts;
- full-length videos.

The clean narration master must remain available independently from music and sound effects.

Consider reasonable defaults around:

- integrated loudness;
- loudness range;
- true-peak ceiling;
- sample rate;
- codec;
- bitrate.

Validate these against the repository’s current video-rendering and upload requirements.

## 11. Narration quality gate

Plan a local quality gate that produces a structured result and human-readable report.

Suggested outcomes:

```text
READY
READY_WITH_WARNINGS
REGENERATION_RECOMMENDED
BLOCKED
```

Evaluate:

- all required chunks exist;
- all chunks passed technical validation;
- duration is plausible;
- no clipping;
- no excessive silence;
- no missing or duplicated chunks;
- assembly order is correct;
- final loudness is within bounds;
- voice and configuration are consistent;
- no fallback path was used without being reported.

Optionally recommend a second, OpenAI-based narration review stage only if it provides enough value relative to cost. Clearly separate local validation from subjective AI review.

Do not require expensive AI review for every production run unless justified.

## 12. CLI and workflow integration

Inspect the existing CLI conventions and plan commands consistent with them.

Potential capabilities include:

```text
narration:prepare
narration:plan
narration:generate
narration:assemble
narration:validate
narration:benchmark-voices
narration:inspect
narration:status
```

Do not force these exact names if the repository already has a better command hierarchy.

The workflow should support:

- one episode and one language;
- one episode and all languages;
- full or short format;
- all formats;
- batch processing;
- resume;
- force regeneration;
- dry-run;
- inspect;
- validation-only;
- voice benchmarking;
- clear machine-readable exit codes.

The normal production command should remain simple and should orchestrate internal stages automatically.

## 13. Artifact and schema design

Plan versioned artifacts for at least:

- spoken narration text;
- chunk manifest;
- performance directions;
- pronunciation transformations;
- individual audio chunks;
- chunk validation reports;
- assembled clean narration;
- mastered narration;
- quality-gate report;
- generation metadata;
- config snapshot.

Follow existing artifact-path contracts where available.

Each artifact should include enough metadata for:

- provenance;
- reproducibility;
- debugging;
- cache invalidation;
- auditing;
- migration;
- manual inspection.

Use strict TypeScript schemas and runtime validation.

Prefer the repository’s existing schema-validation library.

## 14. Observability and security

Plan structured logging for:

- episode;
- language;
- format;
- chunk ID;
- model;
- voice;
- attempt;
- duration;
- input size;
- output size;
- cache hit or miss;
- validation status;
- fallback usage;
- failure classification.

Do not log:

- API keys;
- authorization headers;
- raw secrets;
- excessive full story text;
- binary audio content.

Plan metrics for:

- generation latency;
- success and failure rates;
- retry counts;
- cost-relevant character or token estimates;
- audio seconds generated;
- cache hit rate;
- validation failure reasons;
- regeneration frequency.

Reuse existing observability abstractions.

## 15. Cost controls

The plan should minimize unnecessary OpenAI usage.

Address:

- reusing existing localization or structural-analysis results;
- deterministic performance defaults;
- chunk caching;
- content hashing;
- selective regeneration;
- avoiding duplicate context;
- avoiding AI planning when deterministic planning is sufficient;
- limiting benchmark generation;
- avoiding full-story regeneration after one chunk fails;
- batch-mode compatibility;
- recording usage estimates.

Provide an approximate cost-impact classification for each planned feature:

- negligible;
- low;
- moderate;
- high.

Do not fabricate exact API pricing. Use repository configuration or clearly state that current pricing must be checked externally.

## 16. Migration and backward compatibility

Plan a safe transition from the current narration implementation.

Include:

- current-state flow;
- target-state flow;
- compatibility adapter if needed;
- artifact migration;
- configuration migration;
- feature flag or rollout mode;
- fallback to the existing TTS flow;
- rollback procedure;
- handling of already-generated episodes;
- deprecation path;
- deletion criteria for obsolete code.

Existing successful production workflows must continue to function during migration.

## 17. Testing strategy

Plan tests at multiple levels.

### Unit tests

Cover:

- spoken-text normalization;
- chunk segmentation;
- performance defaults;
- context extraction;
- fingerprint generation;
- pronunciation replacement;
- artifact path generation;
- duration estimation;
- validation classification;
- manifest ordering;
- configuration merging.

### Integration tests

Cover:

- OpenAI request construction using mocks or fixtures;
- retry behavior;
- timeout behavior;
- partial failure;
- cache reuse;
- artifact persistence;
- FFmpeg assembly;
- validation;
- resume behavior.

Do not call the real OpenAI API in normal CI.

### Golden and fixture tests

Use small deterministic audio fixtures to test:

- trimming;
- silence detection;
- crossfades;
- loudness analysis;
- clipping detection;
- ordering;
- malformed files.

### Optional manual tests

Define a repeatable listening test for voice and prompt evaluation.

## Required deliverables

Create a planning directory following the repository’s existing planning conventions.

If no convention exists, use:

```text
docs/plans/natural-openai-narration/
```

Create:

```text
00-current-state-analysis.md
01-target-architecture.md
02-spoken-narration-preparation.md
03-narration-domain-schemas.md
04-performance-direction-planner.md
05-openai-tts-chunk-generation.md
06-pronunciation-and-text-normalization.md
07-audio-validation-and-continuity.md
08-assembly-and-mastering.md
09-quality-gate-and-observability.md
10-cli-and-batch-integration.md
11-migration-and-deprecation.md
12-testing-strategy.md
13-implementation-roadmap.md
```

Also create atomic implementation task files under:

```text
docs/plans/natural-openai-narration/tasks/
```

Each task file must contain:

- objective;
- rationale;
- current relevant files and symbols;
- exact files likely to be modified or created;
- dependencies;
- implementation steps;
- TypeScript types or interfaces involved;
- runtime validation requirements;
- error-handling behavior;
- observability requirements;
- performance considerations;
- security considerations;
- test requirements;
- acceptance criteria;
- explicit non-goals;
- rollback considerations;
- recommended minimum model;
- recommended best model;
- whether it can be implemented in parallel with other tasks.

Keep each task narrow enough for a single Codex implementation session.

## Roadmap requirements

In `13-implementation-roadmap.md`, provide:

1. a dependency graph;
2. recommended implementation waves;
3. tasks safe to execute in parallel;
4. tasks that must remain sequential;
5. minimum and best model recommendations;
6. expected implementation risk;
7. expected cost impact;
8. suggested validation checkpoint after every wave.

Use a table similar to:

```text
| Task | Depends on | Parallel-safe with | Risk | Cost impact | Minimum model | Best model |
```

Optimize task boundaries so implementation can later use less expensive models where safe.

## Architectural expectations

The proposed design should be:

- strongly typed;
- modular;
- testable;
- observable;
- resumable;
- configuration-driven;
- deterministic where practical;
- tolerant of partial failures;
- compatible with batch processing;
- safe for production;
- easy to inspect manually;
- free of unnecessary provider abstractions.

Do not create a generic multi-provider TTS framework. OpenAI TTS is the only required provider.

A small internal interface may still be appropriate for testability, but avoid abstractions whose only purpose is hypothetical future provider support.

## Final response

After writing all plan and task files, return a concise summary containing:

- current narration architecture discovered;
- most important weaknesses;
- recommended target architecture;
- number of tasks created;
- recommended implementation waves;
- highest-risk changes;
- obsolete or duplicated paths that should eventually be removed;
- first task to implement;
- exact paths of all generated planning files.

Do not implement production code during this planning task.
