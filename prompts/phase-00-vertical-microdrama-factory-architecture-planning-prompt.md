# Phase 0 Codex Planning Prompt — Vertical Microdrama Factory Architecture

## Role

Act as a coordinated architecture review team with the following senior personas:

1. **Principal TypeScript / NestJS Platform Architect**
   - Production-grade modular architecture
   - Strict type safety
   - Domain-driven boundaries
   - Distributed workflow design
   - Long-term maintainability

2. **Principal Media Pipeline Engineer**
   - Image/video/TTS generation pipelines
   - FFmpeg composition
   - Media provenance
   - Deterministic rendering
   - Asset caching and reuse
   - Provider abstraction

3. **Principal Reliability / Distributed Systems Engineer**
   - Idempotency
   - Retry ownership
   - Ambiguous post-dispatch failures
   - Durable execution
   - Queue semantics
   - Crash recovery
   - State machines

4. **Principal Observability / FinOps Engineer**
   - Structured logging
   - Metrics
   - Tracing
   - Cost accounting
   - Provider-call attribution
   - Prompt caching
   - Budget gates

5. **Principal Applied AI Architect**
   - LLM orchestration
   - Structured model outputs
   - Semantic QA
   - Prompt/version provenance
   - Model selection
   - Caching
   - Deterministic validation around nondeterministic models

6. **Principal Story Systems Architect**
   - Serialized narrative systems
   - Canon management
   - Character and relationship state
   - Narrative promises
   - Secrets and knowledge graphs
   - Rolling story planning
   - Episode/beat planning

7. **Vertical Microdrama Creative Director**
   - 9:16 episodic storytelling
   - Immediate hooks
   - Emotional escalation
   - Cliffhangers
   - Short-form pacing
   - Visual continuity
   - Serialized retention

8. **Short-Form Growth / Experimentation Architect**
   - TikTok / YouTube Shorts performance analysis
   - Hook testing
   - Retention diagnostics
   - Experiment design
   - Cross-platform publishing
   - Feedback loops
   - Adaptive future planning

You are not implementing the feature in this task.

Your job is to inspect the existing repository and produce the complete architecture and implementation plan for a production-grade **Vertical Microdrama Factory** that will later be implemented incrementally with Codex.

---

# Mission

Design how the existing video-production repository should evolve into a system capable of:

- planning long-running serialized vertical microdramas;
- maintaining strict narrative continuity;
- generating episodes approximately 60–90 seconds by default;
- supporting configurable durations where warranted;
- creating strong first-frame hooks;
- generating escalating short-form drama;
- ending episodes with high-pressure continuation hooks;
- maintaining recurring character and location consistency;
- generating reusable visual/audio assets;
- composing deterministic 9:16 masters;
- performing story, semantic, visual, sequence, technical, and publication QA;
- publishing to YouTube Shorts and TikTok;
- supporting future Instagram Reels or other providers;
- ingesting performance analytics;
- running controlled content experiments;
- learning from performance without corrupting canon;
- progressively adapting future episodes;
- preserving full provenance, cost attribution, and auditability.

The objective is **not** to claim guaranteed virality.

The objective is to build a factory that systematically improves the probability of breakout performance by optimizing:

- scroll-stop;
- first-seconds retention;
- narrative comprehension;
- emotional intensity;
- escalation;
- episode completion;
- cliffhanger pressure;
- comments;
- shares;
- follows;
- next-episode continuation;
- multi-episode session depth.

---

# Critical instruction: inspect before designing

Do not assume the existing architecture.

Before proposing new packages or abstractions, inspect the repository thoroughly.

Determine what already exists and what should be reused.

Do not create parallel implementations of capabilities already present.

In particular, inspect all existing infrastructure related to:

- story generation;
- story rewriting;
- story localization;
- short-form rewriting;
- metadata generation;
- scene planning;
- beat planning;
- semantic planning;
- image-prompt planning;
- image generation;
- image QA;
- sequence QA;
- TTS;
- WPM calibration;
- audio timing;
- subtitle generation;
- image/video rendering;
- FFmpeg composition;
- publication;
- YouTube;
- TikTok if any code already exists;
- provider clients;
- OpenAI clients;
- prompt caching;
- durable local caching;
- provider prompt caching;
- retry logic;
- paid-call characterization;
- cost accounting;
- generation manifests;
- media provenance;
- asset hashes;
- source hashes;
- semantic hashes;
- render hashes;
- workspaces;
- content packs;
- episode IDs;
- locale handling;
- variant handling;
- queue orchestration;
- RabbitMQ;
- durable execution/workflows;
- Prisma;
- PostgreSQL/YugabyteDB;
- Blob/MinIO/object storage;
- job state;
- state machines;
- observability;
- metrics;
- logging;
- tracing;
- CLI tooling;
- configuration;
- feature flags;
- validation;
- test fixtures;
- test helpers;
- integration tests;
- existing architecture documentation;
- existing ADRs;
- prior implementation plans;
- prior Codex-run reports.

---

# Existing production philosophy to preserve

The repository has already been developed with strong controls around expensive provider calls.

Preserve and reuse existing patterns where sound.

The target architecture must continue to support:

- explicit authorization before paid provider calls;
- no accidental image generation;
- no accidental TTS generation;
- no accidental publication;
- deterministic pre-dispatch validation;
- local/durable caching;
- provider prompt caching where supported;
- explicit cache identities;
- exact retry ownership;
- bounded retries;
- cost ceilings;
- model/reasoning selection by task;
- source and artifact hashing;
- full provenance;
- auditable reports;
- focused validation rather than unnecessary repository-wide builds.

Do not regress any of those protections.

---

# External-call policy for Phase 0

During this task:

## Allowed

- local repository reads;
- local static analysis;
- local tests if needed for characterization;
- local typechecking if narrowly useful;
- local grep/search;
- reading existing documentation;
- reading existing plans and reports;
- reading existing schemas/configuration.

## Not allowed

Do not make:

- OpenAI API calls;
- Anthropic API calls;
- image-generation calls;
- video-generation calls;
- TTS calls;
- paid QA calls;
- TikTok API calls;
- YouTube API calls;
- publication calls;
- external media downloads;
- production mutations.

Target:

```text
External provider calls: 0
Paid calls: 0
Publication calls: 0
```

If a repository script would make an external call, do not run it.

---

# No implementation

This is a planning and repository-characterization task only.

Do not:

- implement the microdrama system;
- add new production packages;
- modify Prisma schema;
- refactor current services;
- change provider configuration;
- modify `.env`;
- modify production code;
- modify tests except where an absolutely minimal local characterization fixture is necessary.

Prefer zero code changes.

If you need to create deliverables, restrict changes to architecture/planning documentation.

---

# Primary architectural rule

The future system must follow this principle:

> Structured domain state is authoritative.
> Generated prose, prompts, images, audio, and videos are derived artifacts.

The canonical system of record must never be:

- a prompt;
- an LLM response blob;
- a Markdown script;
- a generated image;
- a rendered MP4;
- a directory layout.

Those are artifacts.

The authoritative state must be typed, versioned, validated, and reproducible.

---

# Target conceptual pipeline

Use this as a target to compare against the repository.

Do not assume every box must become a new package.

```text
Series Strategy
      ↓
Narrative Core
      ↓
Season / Arc Planning
      ↓
Episode Compilation
      ↓
Beat Planning
      ↓
Story QA
      ↓
Hook Lab
      ↓
Retention Diagnostics
      ↓
Scene Planning
      ↓
Shot Planning
      ↓
Visual Continuity
      ↓
Generation
      ↓
Composition
      ↓
Video QA
      ↓
Platform Projection
      ↓
Publishing
      ↓
Analytics
      ↓
Experiments
      ↓
Learning
      ↓
Future Episode Planning
```

---

# Target hierarchy

Determine how the repository should represent:

```text
Series
 └── Season
      └── Arc
           └── Episode
                └── Beat
                     └── Scene
                          └── Shot
```

Do not force all levels if existing architecture has a better equivalent.

Map existing concepts to the proposed hierarchy.

For every existing concept, record:

- current type/name;
- current location;
- current semantics;
- future role;
- reuse/refactor/replace decision.

---

# Architecture investigation 1 — repository topology

Map the repository.

Identify:

- packages;
- apps;
- services;
- CLIs;
- workers;
- shared libraries;
- domain packages;
- provider adapters;
- media packages;
- observability packages;
- orchestration packages;
- docs;
- plans;
- reports;
- tests.

Produce a concise repository map relevant to this project.

Do not document unrelated code in depth.

---

# Architecture investigation 2 — current content domain

Determine what currently represents:

- content;
- story;
- episode;
- short;
- long;
- locale;
- variant;
- source;
- content pack;
- workspace;
- production run;
- revision.

Answer:

1. Is there an existing canonical episode model?
2. Is it typed?
3. Is it persisted?
4. Is it revisioned?
5. Does it contain narrative state?
6. Does it contain media state?
7. Are content identity and artifact identity conflated?
8. Are locale and platform identity conflated?
9. Is publication identity separate from content identity?

---

# Architecture investigation 3 — current story-generation system

Inspect existing story generation and rewriting.

Map:

```text
source
→ planning
→ rewrite
→ localization
→ short derivation
→ validation
```

Document:

- models;
- prompts;
- schemas;
- caching;
- revisions;
- validation;
- retry ownership;
- cost controls;
- input identities;
- output identities.

Determine whether any current story infrastructure can become the basis for:

- SeriesBible;
- StoryArc;
- EpisodeSpec;
- BeatPlan;
- ScriptRevision.

---

# Architecture investigation 4 — current planning systems

Inspect current:

- scene planners;
- semantic planners;
- beat planners;
- prompt planners;
- image preflight planners.

For each:

- input contract;
- output contract;
- schema;
- persistence;
- cache key;
- versioning;
- model use;
- deterministic gates;
- semantic QA;
- ownership.

Determine whether existing planners already implement concepts useful for microdrama.

Avoid duplicating good planner infrastructure.

---

# Architecture investigation 5 — current QA system

Inspect all current QA paths.

Map:

- deterministic validation;
- scene QA;
- beat QA;
- semantic QA;
- escalation;
- sequence QA;
- source-grounded QA;
- image QA;
- render QA;
- provider prompt QA.

Document:

- judge model;
- escalation model;
- advisor model;
- reasoning level;
- retry behavior;
- cache behavior;
- cost controls;
- admission gates;
- pass/block/unavailable semantics.

Determine how this should evolve to include:

- continuity QA;
- canon QA;
- hook QA;
- retention diagnostics;
- dialogue QA;
- cliffhanger QA;
- narrative-promise QA.

---

# Architecture investigation 6 — current generation providers

Map provider boundaries for:

- OpenAI text;
- image generation;
- video generation if present;
- TTS;
- music;
- SFX.

Determine:

- whether provider-neutral interfaces already exist;
- how requests are typed;
- how results are typed;
- how retries are owned;
- how ambiguous dispatch failures are handled;
- how provider request IDs are persisted;
- how costs are recorded;
- how cache keys are built;
- how model/reasoning configuration is resolved.

Recommend reuse rather than new adapters where possible.

---

# Architecture investigation 7 — media asset lifecycle

Trace one existing generated episode from source to final render.

Document:

```text
source
→ semantic plan
→ prompt
→ generated asset
→ QA
→ selected asset
→ timeline
→ render
→ publication artifact
```

For every step, identify:

- file location;
- database record if any;
- hash;
- revision;
- provenance;
- cacheability;
- invalidation rules.

Determine whether media assets have a proper registry or whether identity is inferred from files.

---

# Architecture investigation 8 — visual continuity

Determine what currently exists for:

- character references;
- reference image lookup;
- canonical faces;
- locations;
- wardrobe;
- props;
- visual motif control;
- shot continuity;
- scene continuity.

The future microdrama system will require recurring characters.

Identify gaps required for:

```text
CharacterAssetPack
CharacterAppearanceRevision
Wardrobe
Location
Prop
ReferenceAsset
```

Do not implement these.

---

# Architecture investigation 9 — composition

Inspect:

- timeline representation;
- FFmpeg invocation;
- transition logic;
- image duration;
- video duration;
- subtitle composition;
- music;
- SFX;
- dialogue;
- audio mixing;
- render manifests.

Determine whether the canonical representation is:

- typed timeline state;
- command-line arguments;
- filesystem layout;
- ad-hoc scripting.

Recommend the minimum evolution needed for deterministic episode composition.

---

# Architecture investigation 10 — publishing

Inspect current YouTube publishing.

Document:

- publication domain model;
- provider abstraction;
- scheduling;
- idempotency;
- retry ownership;
- authentication;
- token storage;
- status reconciliation;
- metadata projection;
- publication logs;
- publication persistence;
- CLI commands.

Determine what should be generalized for:

```text
YouTube
TikTok
future providers
```

Do not redesign YouTube unnecessarily.

---

# Architecture investigation 11 — analytics

Determine whether the repository currently ingests:

- YouTube analytics;
- video views;
- watch time;
- retention;
- likes;
- comments;
- shares;
- follower/subscriber changes;
- publication status.

Determine what storage model exists.

Identify the minimum new analytics domain required for:

```text
PerformanceObservation
NormalizedMetric
ExperimentAssignment
ExperimentResult
LearningFinding
CreativeRecommendation
```

---

# Architecture investigation 12 — persistence

Inspect Prisma and persistence patterns.

Determine where the following should live:

## Narrative state

Potential entities:

- Series;
- Season;
- StoryArc;
- Episode;
- EpisodeRevision;
- NarrativeSnapshot;
- Character;
- CharacterState;
- RelationshipState;
- NarrativeSecret;
- KnowledgeClaim;
- NarrativePromise.

## Production state

Potential entities:

- BeatPlan;
- ScenePlan;
- ShotPlan;
- GeneratedAsset;
- Render;
- QAAdmission.

## Publication state

Potential entities:

- Publication;
- PublicationAttempt;
- ProviderAccount;
- RemotePublication.

## Analytics state

Potential entities:

- PerformanceObservation;
- Experiment;
- ExperimentAssignment;
- ExperimentResult;
- LearningFinding.

Do not assume every concept belongs in a relational table.

For each proposed persistent concept, recommend one of:

- relational entity;
- validated JSON;
- artifact file;
- immutable report;
- derived cache only.

Explain why.

---

# Target Narrative Core

The future architecture should support a domain similar to the following.

These are conceptual contracts, not mandatory exact interfaces.

## SeriesBible

Must capture stable creative rules:

- premise;
- genre;
- subgenre;
- audience;
- emotional promise;
- central conflict;
- central mystery;
- tone;
- themes;
- storytelling rules;
- prohibited patterns.

## Character

Separate:

```text
immutable identity
```

from:

```text
mutable episode state
```

Important attributes may include:

- narrative role;
- wants;
- needs;
- fears;
- flaws;
- contradictions;
- speech profile;
- current goal;
- current belief;
- current emotional state;
- current location;
- current wardrobe.

## RelationshipState

Relationships must be directional.

Possible dimensions:

- affinity;
- trust;
- attraction;
- resentment;
- fear;
- dependency.

## NarrativeSecret

Must distinguish:

- objective fact;
- holders;
- affected characters;
- audience knowledge;
- reveal constraints;
- reveal status.

## KnowledgeClaim

Must distinguish:

```text
truth
character knowledge
character belief
character suspicion
audience knowledge
```

## NarrativePromise

Represents open dramatic questions such as:

- who sent the message;
- why a character returned;
- whether a betrayal is discovered.

Must support:

- planted episode;
- expected payoff window;
- progression;
- resolution.

## NarrativeSnapshot

After every accepted/published episode, the system should be capable of producing a deterministic narrative state snapshot.

This should make continuity reproducible.

---

# Target Story Planning

Plan for multiple horizons.

## Macro horizon

Approximately 100 episodes.

High-level only.

Defines:

- major turns;
- main relationship evolution;
- season mystery;
- major reveals;
- final state.

## Arc horizon

Approximately 4–8 episodes per arc, adjusted by story.

Each arc should describe:

- dramatic question;
- starting narrative state;
- target ending state;
- required events;
- optional events;
- forbidden reveals;
- required payoffs.

## Near horizon

Approximately next 3–10 episodes.

More specific state transitions.

## Production horizon

Current episode only.

Exact:

- EpisodeSpec;
- BeatPlan;
- ScriptRevision;
- ScenePlan;
- ShotPlan.

Do not fully script 100 episodes upfront.

---

# Rolling planning architecture

The future system should allow:

```text
Series macro plan
       ↓
Arc plan
       ↓
Next 3–5 episode intentions
       ↓
Current episode production
       ↓
Publication
       ↓
Performance observations
       ↓
Learning recommendations
       ↓
Future episode planning
```

Performance can influence future planning.

Performance must not retroactively mutate canon.

---

# Target EpisodeSpec

Plan a typed episode contract that can express:

- episode number;
- arc;
- objective;
- audience question;
- starting conditions;
- required events;
- forbidden events;
- characters;
- promises to advance;
- promises to resolve;
- secrets available for reveal;
- required ending state;
- cliffhanger requirement;
- duration target.

The EpisodeSpec should be the writer's contract.

---

# Target BeatPlan

Plan a typed beat model.

Beat categories may include:

- HOOK;
- ORIENTATION;
- CONFLICT;
- ESCALATION;
- DISCOVERY;
- REVERSAL;
- DECISION;
- CONSEQUENCE;
- CLIFFHANGER.

Each beat should be able to express:

- narrative purpose;
- event;
- involved characters;
- information gain;
- character knowledge change;
- emotional change;
- promise progression;
- duration target.

---

# Episode grammar

The system should optimize for a short-form dramatic progression approximately like:

```text
HOOK
→ QUESTION
→ CONFLICT
→ ESCALATION
→ NEW INFORMATION
→ REVERSAL
→ CONSEQUENCE
→ CLIFFHANGER
```

Do not hard-code exact timestamps as mandatory.

A default target for initial testing may be approximately:

```text
0–2s    rupture / first-frame event
2–8s    orientation
8–20s   conflict
20–35s  escalation
35–50s  complication
50–65s  reversal
65–78s  consequence
78–90s  cliffhanger
```

Treat this as a tuning profile, not a universal template.

---

# Hook architecture

Plan a Hook Lab.

Do not render many complete episode variants.

Preferred progression:

```text
6 text hooks
   ↓
3 planned hooks
   ↓
2 short rendered hook candidates
   ↓
1 production master
```

Evaluate hook candidates on:

- immediacy;
- conflict;
- clarity;
- curiosity;
- emotional intensity;
- visual strength;
- specificity;
- novelty;
- spoiler risk;
- story relevance.

The first frame should usually contain the dramatic event rather than setup.

---

# Retention diagnostics

Plan a diagnostic system for 3–5 second narrative windows.

Do not claim it predicts real retention.

The purpose is to detect dramatic dead zones before rendering.

Possible window dimensions:

- novelty;
- conflict;
- emotion;
- curiosity;
- information gain;
- visual potential;
- risk;
- surprise;
- reaction value.

The system should identify:

```text
dead-zone risk
```

rather than output fake precision.

---

# Virality diagnostics

Do not design a single arbitrary `viralScore`.

Keep dimensions separate initially.

Recommended dimensions:

- hook;
- immediate conflict;
- comprehension;
- curiosity;
- emotional intensity;
- escalation;
- reversals;
- character investment;
- visual potential;
- cliffhanger;
- commentability;
- shareability;
- continuation pressure;
- freshness.

Real performance data can later determine empirical weighting.

---

# Cliffhanger architecture

Plan a typed cliffhanger taxonomy.

Potential categories:

- identity reveal;
- betrayal;
- interruption;
- discovery;
- decision;
- arrival;
- threat;
- reversal;
- secret exposed;
- false assumption;
- physical danger;
- relationship shift.

Track cliffhanger repetition.

The planner should be able to detect overuse of the same device.

---

# Story QA

Separate deterministic QA from semantic QA.

## Deterministic QA

Should detect where possible:

- nonexistent character references;
- nonexistent secrets;
- illegal state transitions;
- forbidden reveals;
- impossible chronology;
- missing required events;
- unresolved required promises;
- invalid knowledge transitions;
- duplicate IDs;
- impossible episode ranges;
- invalid duration budgets.

No LLM required.

## Semantic QA

May evaluate:

- dialogue naturalness;
- hook strength;
- emotional impact;
- escalation;
- predictability;
- character motivation;
- cliffhanger quality;
- freshness;
- comprehension.

The future architecture should reuse existing paid-QA infrastructure where appropriate.

---

# Model boundary

The architecture must enforce:

```text
models propose
domain code validates
QA evaluates
state machines commit
```

An LLM must never directly mutate canonical narrative state.

Any accepted model output must pass:

1. runtime schema validation;
2. deterministic domain validation;
3. semantic QA where required;
4. explicit state transition.

---

# Revision model

Determine how to support immutable or append-only revisions for:

- SeriesBible;
- StoryArc;
- EpisodeSpec;
- BeatPlan;
- Script;
- ScenePlan;
- ShotPlan;
- Render;
- metadata.

The architecture must allow provenance such as:

```text
Script v5
derived from:
  EpisodeSpec v6
  BeatPlan v3
  NarrativeSnapshot after E16
```

Do not silently overwrite accepted artifacts.

---

# Hashing and caching

Inspect existing cache/hash infrastructure and recommend how it should be reused.

Potential semantic cache identities:

```text
episode-plan-key =
SHA256(
  plannerVersion
  + EpisodeSpec
  + NarrativeSnapshotHash
  + SeriesBibleRevision
)
```

Similarly plan identities for:

- beat plan;
- script;
- scene plan;
- shot plan;
- TTS;
- image;
- video generation;
- render;
- metadata;
- publication projection.

Important:

A cache key must include every semantic input capable of changing the result.

---

# Character visual consistency

Plan a reusable Character Asset Registry.

Possible concepts:

```text
CharacterAssetPack
CharacterAppearanceRevision
Wardrobe
ReferenceAsset
```

A recurring character may need:

- canonical portrait;
- front;
- 3/4 left;
- 3/4 right;
- side;
- full body;
- key expressions;
- canonical wardrobe sets.

Every production shot should reference stable IDs rather than free-text character descriptions.

Determine how this should integrate with any existing reference-image system.

---

# Location continuity

Plan equivalent support for:

```text
Location
LocationRevision
LocationReferenceAsset
Prop
Wardrobe
```

Recurring locations must be visually stable across episodes.

Determine whether current semantic planning already has reusable location identity.

---

# Production planning

Determine the appropriate canonical contracts for:

```text
ScenePlan
ShotPlan
Blocking
Camera
Action
Dialogue
Reaction
EmotionalPurpose
NarrativePurpose
ContinuityRequirement
Transition
```

A prompt sent to an image/video provider must be derived from this structured plan.

The prompt itself must not be the canonical shot representation.

---

# Reaction shots

Treat reactions as first-class narrative events.

The shot model should be able to represent:

- spoken information;
- listener reaction;
- visible emotional consequence;
- nonverbal subtext.

The future editor should not simply cut on dialogue boundaries.

---

# Audio architecture

Plan distinct layers for:

- dialogue;
- ambience;
- SFX;
- music.

Determine how current TTS/audio-timing systems can be reused.

Music should eventually support an emotional/tension envelope rather than a single static background file.

Do not implement music generation in Phase 0.

---

# Subtitle architecture

Inspect existing subtitle generation.

Plan for:

- word alignment;
- phrase grouping;
- safe-zone placement;
- 9:16 composition;
- localization;
- timing provenance.

Determine whether subtitle data belongs in the canonical timeline.

---

# Timeline architecture

Inspect current render/composition implementation.

Recommend whether the future canonical representation should become a typed timeline such as:

```text
EpisodeTimeline
  video tracks
  dialogue track
  music track
  SFX track
  subtitles
```

FFmpeg should ideally compile the timeline.

FFmpeg command-line strings should not themselves be the source of truth.

---

# Episode production state machine

Plan an explicit state machine.

Potential states:

```text
DRAFT
PLANNED
STORY_QA
STORY_APPROVED
SHOT_PLANNED
ASSETS_PENDING
ASSETS_READY
COMPOSING
RENDERED
VIDEO_QA
PRODUCTION_READY
PUBLISH_READY
PUBLISHED
```

Potential exceptional states:

```text
BLOCKED
FAILED
SUPERSEDED
```

Do not use these exact states blindly.

Map them against existing repository state semantics.

No state should be inferred solely from filesystem presence.

---

# Approval gates

Plan at minimum:

```text
STORY_APPROVED
ASSET_GENERATION_APPROVED
PUBLICATION_APPROVED
```

These gates may become automatically grantable later.

Initially they should preserve explicit control over expensive/external side effects.

---

# Provider-neutral generation

Determine whether existing generation architecture already supports provider abstraction.

The microdrama domain must not depend directly on:

- OpenAI;
- a specific image model;
- a specific video model;
- ElevenLabs;
- FFmpeg implementation details.

Use provider adapters at infrastructure boundaries.

---

# Generation provenance

Every generated asset should be traceable to:

- episode;
- scene;
- shot;
- source hash;
- prompt/config revision;
- provider;
- model;
- reasoning level if applicable;
- provider request ID;
- request hash;
- output hash;
- cost;
- generation timestamp.

Determine how much of this already exists.

---

# Publication architecture

The target is one canonical vertical master capable of platform projections.

Conceptually:

```text
Canonical 9:16 Master
      │
      ├── TikTok Projection
      │      ├── caption
      │      ├── hashtags
      │      ├── settings
      │      └── publication
      │
      └── YouTube Shorts Projection
             ├── title
             ├── description
             ├── hashtags
             ├── playlist
             └── publication
```

Do not reuse provider metadata verbatim.

Inspect current YouTube metadata generation and determine how to evolve it.

---

# TikTok architecture

Plan for the official Content Posting API only.

Do not propose:

- browser automation;
- Playwright;
- Selenium;
- cookie automation;
- reverse-engineered mobile APIs.

Account for:

- OAuth;
- account mapping;
- Direct Post;
- status reconciliation;
- provider audit/approval;
- upload strategy;
- pull-from-URL strategy where appropriate;
- rate limiting;
- retries;
- idempotency;
- ambiguous post-dispatch states.

Do not make any TikTok calls.

---

# Publication idempotency

Publication is an externally visible side effect.

Plan deterministic identity based on appropriate stable inputs such as:

```text
provider
provider account
episode
locale
variant
render revision
metadata revision
```

Never blindly retry a publication after an ambiguous post-dispatch failure.

Prefer reconciliation.

Map this against current YouTube publication behavior.

---

# Localization architecture

The future system may produce localized variants.

Inspect current localization handling.

Determine how to support:

- localized dialogue;
- localized TTS;
- localized subtitles;
- localized metadata;
- reuse of canonical visual assets where semantically valid;
- platform-specific localized publication.

Keep narrative canon language-neutral where possible.

Do not duplicate full narrative state per language unless genuinely required.

---

# Analytics architecture

Plan a raw observation model.

Potential fields:

```text
publicationId
observedAt
views
likes
comments
shares
averageWatchTime
completionRate
followersAttributed
providerPayload
```

Do not assume every provider exposes all metrics.

Keep raw provider payloads where legally/operationally appropriate.

Normalize separately.

---

# Series performance metrics

The analytics model should eventually support:

- hook hold;
- completion;
- rewatch;
- share rate;
- comment rate;
- follow rate;
- continuation rate;
- session depth.

A microdrama series must optimize beyond raw views.

In particular, plan for:

```text
Episode Continuation Rate
```

and:

```text
Multi-Episode Session Depth
```

where provider data permits derivation.

---

# Experiment framework

Plan typed content experiments.

Potential experiment variables:

- hook;
- duration;
- cliffhanger type;
- pacing;
- subtitle style;
- cover;
- caption;
- character focus;
- trope.

The system should record:

- hypothesis;
- control;
- candidates;
- assignment;
- publication;
- observation window;
- result.

Prefer experiments that vary one meaningful dimension at a time.

---

# Learning architecture

The learning system should have distinct layers:

```text
Raw Observations
      ↓
Normalized Metrics
      ↓
Experiment Results
      ↓
Content Findings
      ↓
Creative Recommendations
```

Example:

```text
Finding:
Betrayal-discovery hooks outperform
verbal-confrontation openings in this audience.
```

may become:

```text
Recommendation:
Prefer visually explicit discovery events at
arc openings where narratively valid.
```

It must not become:

```text
rewrite all future episodes around betrayal
```

without story-planner validation.

---

# Canon protection from analytics

This is a hard architectural requirement:

> Analytics may influence future planning.
> Analytics may not directly mutate established canon.

All recommendations must be validated against:

- SeriesBible;
- StoryArc;
- current NarrativeSnapshot;
- open promises;
- required payoffs;
- secrets;
- character logic.

---

# Observability

Inspect existing logging and metrics.

The future system should support correlation across:

```text
seriesId
seasonId
arcId
episodeId
revisionId
beatId
sceneId
shotId
assetId
renderId
publicationId
provider
providerRequestId
```

Do not expose secrets or full provider credentials.

Avoid high-cardinality Prometheus labels.

Determine which identifiers belong in structured logs versus metrics labels.

---

# Cost accounting

The future factory must be able to explain cost per:

- episode;
- script revision;
- QA cycle;
- image;
- video;
- TTS;
- render;
- provider;
- publication.

Reuse the existing cost-accounting system.

Identify any gaps.

Paid-call planning should preserve explicit ceilings.

---

# Retry architecture

Inspect current retry characterization.

For every future provider boundary, identify a single retry owner.

Avoid nested retries between:

- SDK;
- shared provider client;
- service layer;
- worker;
- durable workflow.

Classify failures:

```text
pre-dispatch
post-dispatch known failure
ambiguous post-dispatch
provider 4xx
provider 5xx
rate limit
auth
timeout
```

The Phase 0 plan must explicitly preserve existing safe retry semantics.

---

# Security

Review implications for:

- provider credentials;
- OAuth tokens;
- signed asset URLs;
- Blob/MinIO access;
- publication permissions;
- cross-account publishing;
- prompt injection through source material;
- untrusted provider responses;
- log redaction.

Pay special attention to preventing:

```text
episode intended for account A
→ publication on account B
```

Provider account identity should be explicit and immutable within a publication attempt.

---

# Testing architecture

Plan layered verification.

## Domain unit tests

Examples:

- branded IDs;
- runtime schemas;
- state transitions;
- canon updates;
- relationship state;
- secret reveal rules;
- knowledge transitions;
- narrative-promise deadlines.

## Planner contract tests

Examples:

- valid EpisodeSpec;
- forbidden reveal rejection;
- missing required event;
- bad duration budget.

## QA tests

Examples:

- deterministic gate fixtures;
- semantic judge mocks;
- escalation ownership;
- cache hits.

## Generation tests

Provider mocks only initially.

## Media tests

Fixture-based:

- timeline compilation;
- subtitle timing;
- FFprobe validation.

## Publication tests

Mock provider HTTP.

## Analytics tests

Fixture provider payloads.

## End-to-end tests

No paid provider calls by default.

---

# Focused validation policy

Continue using risk-based, focused validation.

For every future implementation phase, define:

- exact packages affected;
- exact typechecks;
- exact unit/integration tests;
- exact lint scope;
- exact fixture verification.

Do not require full repository builds for every bounded change unless risk justifies it.

---

# Proposed package architecture

Do not adopt this blindly.

Compare it with the actual repository and produce the best-fitting structure.

Possible conceptual modules:

```text
narrative-core/
story-planner/
story-qa/
drama-planner/
asset-registry/
generation/
composition/
video-qa/
publishing/
experiments/
analytics/
learning/
```

For each concept, decide:

```text
REUSE EXISTING
EXTEND EXISTING
NEW PACKAGE
DO NOT BUILD
```

Explain the decision.

---

# Desired implementation workstreams

Produce an implementation DAG covering approximately these capability areas:

```text
01 Repository characterization

02 Narrative type system
03 Canon ledger
04 Character/relationship graph
05 Secrets + knowledge
06 Narrative promises
07 Snapshot/revision system

08 Season/arc planner
09 Episode compiler
10 Beat planner

11 Deterministic story validator
12 Semantic story QA
13 Hook Lab
14 Retention diagnostics
15 Cliffhanger QA

16 Visual asset registry
17 Character continuity
18 Location/wardrobe/prop continuity

19 Scene planner
20 Shot planner
21 Provider prompt compiler

22 Image generation
23 Video generation
24 Speech
25 Music/SFX

26 Timeline/composition
27 Subtitle engine
28 Render pipeline

29 Technical video QA
30 Semantic visual QA
31 Sequence QA

32 Publication domain
33 YouTube adapter
34 TikTok adapter

35 Analytics ingestion
36 Normalized metrics

37 Experiment framework
38 Performance attribution

39 Learning engine
40 Adaptive planning

41 Operator CLI/control plane
42 End-to-end canary
```

Consolidate workstreams if the repository already contains significant portions.

Do not inflate the phase count unnecessarily.

---

# Implementation dependency graph

The final plan must contain a dependency graph.

Example conceptual dependency:

```text
Repository characterization
        ↓
Narrative Core
        ↓
Story Planner
        ↓
Story QA
        ↓
Production Domain
        ↓
Visual Continuity
        ↓
Generation
        ↓
Composition
        ↓
Video QA
        ↓
Publishing
        ↓
Analytics
        ↓
Experiments
        ↓
Learning
```

Identify parallelizable work where safe.

---

# Phase sizing

Every implementation task proposed for Codex should be bounded.

A good implementation unit should normally:

- have one clear primary goal;
- touch a small set of related modules;
- have explicit acceptance criteria;
- have focused tests;
- avoid unrelated refactoring;
- avoid paid provider calls unless explicitly authorized;
- produce a report.

If a phase is too large, split it.

---

# Model strategy planning

Do not make model calls in Phase 0.

However, inspect current model configuration and recommend future task classes.

Map future responsibilities such as:

- macro story planning;
- episode planning;
- story rewrite;
- localization;
- hook generation;
- semantic QA;
- visual QA;
- repair;
- metadata.

For each, propose:

- existing configured model if suitable;
- reasoning level;
- expected caching;
- escalation path.

Prefer current low-cost infrastructure where quality is sufficient.

Do not increase model cost without justification.

---

# Existing microdrama production target

Assume initial product goals:

- vertical 9:16;
- serialized fiction;
- default episode target around 60–90 seconds;
- strong immediate dramatic hook;
- escalating emotional conflict;
- cliffhanger ending;
- recurring characters;
- recurring locations;
- high visual consistency;
- TikTok + YouTube Shorts;
- additional providers later;
- long-form season planning but rolling episode production;
- analytics-informed future planning.

Do not hard-code genre.

The architecture should support romance, thriller, workplace drama, mystery, revenge, comedy-drama, etc.

---

# First-season planning philosophy

Do not fully write and render 100 episodes upfront.

The future factory should support:

```text
100-episode macro story
        ↓
15–20 approximate arcs
        ↓
next 10 episodes outlined
        ↓
next 3 episodes planned
        ↓
current episode scripted and produced
```

After publication, future episode planning may adapt within canon constraints.

---

# Production readiness criteria

Define a future multi-gate readiness model.

Possible categories:

## Story

- continuity;
- canon;
- character motivation;
- promise integrity.

## Retention

- hook;
- comprehension;
- escalation;
- no material dead zone;
- reversal;
- cliffhanger.

## Visual

- recurring-character consistency;
- location continuity;
- readable expressions;
- blocking;
- no unacceptable artifacts.

## Audio

- dialogue intelligibility;
- TTS quality;
- subtitle sync;
- music/SFX balance.

## Technical

- 9:16;
- codec;
- frame rate;
- duration;
- safe-zone compliance.

## Publication

- provider metadata;
- account identity;
- idempotency;
- auth;
- provider validation.

Do not finalize exact thresholds in Phase 0 unless the repository already establishes them.

---

# Documentation deliverables

Create a Phase 0 planning report under the repository's established docs structure.

Prefer something equivalent to:

```text
docs/microdrama/plans/phase-00-repository-characterization.md
```

If the repository has a different standard, follow it.

Also recommend an ADR set.

Potential ADRs:

```text
001-structured-narrative-state
002-immutable-revisions
003-rolling-story-planning
004-provider-neutral-generation
005-provider-neutral-publication
006-analytics-cannot-mutate-canon
007-explicit-paid-call-gates
```

Do not create unnecessary ADRs.

---

# Required architecture diagrams

Include Mermaid diagrams for:

## 1. Current repository pipeline

Actual current implementation.

## 2. Target microdrama pipeline

From SeriesBible through analytics/learning.

## 3. Domain hierarchy

Series → Season → Arc → Episode → Beat → Scene → Shot.

## 4. Narrative state

Characters, relationships, secrets, knowledge, promises, snapshot.

## 5. Production lineage

EpisodeSpec → BeatPlan → Script → ScenePlan → ShotPlan → Assets → Timeline → Render.

## 6. Publishing lineage

Render → PlatformProjection → Publication → Observations.

## 7. Learning loop

Observations → normalized metrics → findings → recommendations → future planner.

## 8. Implementation dependency graph

Phases and parallelizable branches.

---

# Gap classification

Every identified gap must be classified:

```text
BLOCKING
HIGH
MEDIUM
LOW
OPTIONAL
```

Examples of blocking issues:

- no stable content identity;
- no revision semantics;
- no safe paid-call boundary;
- no publication idempotency;
- no canonical narrative state.

Do not classify cosmetic issues as blocking.

---

# Reuse matrix

Create a table:

| Capability | Current implementation | Reuse? | Required change | Risk |
|---|---|---:|---|---|

Cover at least:

- text generation;
- story rewrite;
- localization;
- planner infrastructure;
- structured output;
- QA infrastructure;
- caching;
- cost accounting;
- image generation;
- TTS;
- timing;
- scene planning;
- image prompts;
- image QA;
- sequence QA;
- composition;
- subtitles;
- publication;
- analytics;
- observability.

---

# Data ownership matrix

Create a matrix describing the source of truth for:

- series definition;
- narrative canon;
- current narrative state;
- episode spec;
- beat plan;
- script;
- shot plan;
- generated assets;
- timeline;
- render;
- publication;
- analytics;
- experiment;
- learning finding.

For each, specify:

- authoritative storage;
- revisioned?;
- hashed?;
- cacheable?;
- derived from.

---

# Side-effect matrix

Create a matrix for all external side effects:

| Side effect | Provider | Paid? | Idempotent? | Retry owner | Approval gate |
|---|---|---:|---:|---|---|

Include:

- LLM generation;
- LLM QA;
- image generation;
- video generation;
- TTS;
- publication;
- analytics fetches where relevant.

---

# Cost boundary matrix

Document which future phases can remain completely free/local and which require external provider calls.

Example categories:

```text
LOCAL ONLY
EXTERNAL READ
PAID GENERATION
PAID QA
PUBLICATION SIDE EFFECT
```

This must be explicit in the implementation DAG.

---

# Risk analysis

At minimum assess:

## Narrative risks

- continuity drift;
- premature reveals;
- forgotten promises;
- repetitive cliffhangers;
- repetitive hooks;
- characters acting inconsistently;
- analytics overfitting.

## AI risks

- malformed structured output;
- prompt drift;
- schema drift;
- nondeterministic repairs;
- hallucinated canon;
- model/version change.

## Media risks

- character identity drift;
- wardrobe/location drift;
- image artifacts;
- video temporal artifacts;
- audio desync;
- subtitle errors.

## Reliability risks

- duplicate expensive generation;
- ambiguous provider failures;
- nested retries;
- lost workflow state;
- inconsistent cache keys.

## Publication risks

- duplicate publication;
- wrong account;
- incorrect locale;
- auth expiry;
- provider rejection;
- ambiguous remote status.

## Analytics risks

- provider metric mismatch;
- delayed metrics;
- missing retention data;
- invalid cross-platform comparison;
- false causal conclusions.

---

# Explicit anti-patterns

The target plan must reject:

```text
one giant "generate episode" function
```

Reject:

```text
LLM reads all old scripts and guesses canon
```

Reject:

```text
filesystem presence = workflow state
```

Reject:

```text
prompt text = canonical shot definition
```

Reject:

```text
single viralScore from an LLM
```

Reject:

```text
analytics directly modifies story canon
```

Reject:

```text
generate all 100 finished episodes upfront
```

Reject:

```text
generic SocialPublisher abstraction that hides provider semantics
```

Reject:

```text
blind retry after ambiguous external side effect
```

Reject:

```text
provider SDK + service + queue all retrying
```

Reject:

```text
new parallel implementation when existing infrastructure is reusable
```

---

# Final deliverable structure

The planning report must contain these sections.

## A. Executive summary

State:

- current architectural fitness;
- major reusable systems;
- major missing systems;
- recommended target architecture;
- principal risks.

## B. Current repository architecture

Describe relevant current implementation.

## C. Existing pipeline

Trace at least one current episode workflow end-to-end.

## D. Reuse matrix

What stays, what evolves, what should not be reused.

## E. Target architecture

Component/module boundaries.

## F. Narrative domain model

Series, arcs, characters, relationships, secrets, knowledge, promises, snapshots.

## G. Story planning architecture

Macro, arc, near-horizon, production-horizon planning.

## H. Story QA architecture

Deterministic and semantic gates.

## I. Hook/retention architecture

Hook Lab and retention diagnostics.

## J. Production domain

Scene/shot/timeline boundaries.

## K. Visual continuity

Character/location/wardrobe/prop strategy.

## L. Generation architecture

Provider adapters, caching, retries, provenance.

## M. Composition architecture

Timeline, subtitles, audio, FFmpeg.

## N. Production QA

Technical, visual, semantic, sequence.

## O. Publishing architecture

YouTube, TikTok, provider-neutral domain.

## P. Analytics architecture

Raw and normalized metrics.

## Q. Experiment architecture

Hypotheses, variants, attribution.

## R. Learning architecture

Findings and recommendations.

## S. Persistence/data model

What should be persisted and where.

## T. State machines

Narrative revision and episode production.

## U. Security

Credentials, account isolation, signed URLs, logs.

## V. Reliability

Idempotency, retry ownership, crash recovery.

## W. Observability

Logs, metrics, traces, cost attribution.

## X. Implementation DAG

Bounded phases with dependencies.

## Y. Validation strategy

Focused tests per phase.

## Z. Risks and open questions

Classified by severity.

---

# Phase table requirement

For every proposed implementation phase, provide:

| Field | Required |
|---|---|
| Phase | yes |
| Goal | yes |
| Scope | yes |
| Existing modules reused | yes |
| New modules | yes |
| Files/packages likely touched | yes |
| Persistence change | yes |
| External calls allowed | yes |
| Paid calls allowed | yes |
| Tests | yes |
| Validation commands | yes |
| Risks | yes |
| Rollback strategy | yes |
| Acceptance criteria | yes |
| Next gate | yes |

---

# Recommended first implementation phase

The Phase 0 report must conclude with exactly one bounded recommended implementation task.

Expected direction, subject to repository findings:

```text
Implement Narrative Core domain contracts and runtime validation only.
```

That task should ideally include:

- typed IDs;
- SeriesBible;
- Character;
- CharacterState;
- RelationshipState;
- NarrativeSecret;
- KnowledgeClaim;
- NarrativePromise;
- NarrativeSnapshot;
- runtime schemas;
- deterministic validators;
- focused unit tests.

It should not yet include:

- LLM planners;
- paid QA;
- media;
- publishing;
- analytics.

However, if repository inspection proves a different dependency must be addressed first, explain why.

---

# Required final console summary

At completion, print:

```text
MICRODRAMA_PHASE_00: READY | BLOCKED
```

Then:

```text
Repository architecture:
<summary>

Existing systems reusable:
<summary>

Major architectural gaps:
<summary>

Recommended target modules:
<summary>

Persistence impact:
<summary>

Provider architecture impact:
<summary>

Narrative architecture impact:
<summary>

Production architecture impact:
<summary>

Publishing architecture impact:
<summary>

Analytics architecture impact:
<summary>

Security risks:
<summary>

Reliability risks:
<summary>

External calls made:
0

Paid calls made:
0

Publication calls made:
0

Planning document:
<exact path>

NEXT TASK:
<one bounded implementation task>
```

Do not start `NEXT TASK`.

---

# Quality bar

The final plan must be suitable for subsequent implementation by independent Codex sessions.

A future Codex session should not need to infer:

- package boundaries;
- state ownership;
- persistence ownership;
- side-effect boundaries;
- retry ownership;
- provider responsibilities;
- cost gates;
- test requirements;
- implementation order.

Where the repository already answers one of these questions, cite the exact implementation or documentation path.

Where the repository does not answer it, make a recommendation and mark it explicitly as a proposed architecture decision.

Favor:

1. correctness;
2. continuity;
3. deterministic state;
4. idempotency;
5. reproducibility;
6. type safety;
7. cost control;
8. observability;
9. modularity;
10. extensibility.

Do not optimize prematurely for scale that is not yet required.

Do not over-engineer speculative functionality.

Do not make paid or external calls.

Do not implement production code.

Finish with the Phase 0 architecture plan only.
