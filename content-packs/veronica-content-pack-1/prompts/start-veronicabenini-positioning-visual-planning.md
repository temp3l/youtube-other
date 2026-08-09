# Cursor Prompt — Start Visual Planning for the Multilingual Positioning Series

## Role

Act as a senior YouTube visual director, storyboard editor, and production-pipeline engineer working inside the existing `veronicaBenini` genre pipeline.

Your job is to start **visual planning only** for the optimized multilingual positioning series.

Do **not** generate final images, TTS, videos, or publish anything in this task.

---

## Primary objective

Create production-ready canonical visual plans for all stories in:

`youtube-positioning-series-multilingual-v2-optimized`

The source pack contains:

- 6 long-form videos
- 18 supporting Shorts
- 5 narration locales:
  - English
  - German
  - Italian
  - French
  - Portuguese
- 24 stable content IDs
- shared visual-reuse metadata
- optimized titles
- narration lengths
- localization QA
- before/after editorial ratings

The existing `veronicaBenini` pipeline must remain the implementation target.

The key invariant is:

> One canonical visual plan per content ID, reused across all five narration languages.

There must be **no per-language image regeneration**.

---

## Source authority

Treat the optimized pack as authoritative editorial input.

Use, in priority order:

1. `README.md`
2. `EDITORIAL-REVIEW-AND-RATINGS.md`
3. `LOCALIZATION-QA.md`
4. `meta/visual-reuse-manifest.json`
5. `meta/long-titles.json`
6. `meta/shorts.json`
7. `meta/narration-lengths.json`
8. canonical English narration files under `long/en` and `shorts/en`
9. localized narrations only for semantic-alignment validation

Do not return to the original Whisper transcripts unless a critical ambiguity cannot be resolved from the optimized pack.

Do not rewrite the narration in this task.

---

## Input discovery

Locate the optimized pack in the workspace.

Prefer an already extracted directory.

Search for:

`youtube-positioning-series-multilingual-v2-optimized`

If only the ZIP exists, extract it into a deterministic local working directory that does not overwrite source artifacts.

If neither the directory nor ZIP exists:

- stop the planning workflow;
- report the exact missing artifact;
- do not invent narration or reconstruct the pack from memory.

---

## Existing pipeline first

Before changing anything:

1. inspect the existing `veronicaBenini` genre implementation;
2. locate the current visual planning entry points;
3. locate existing plan schemas and validators;
4. locate scene/shot/image prompt models;
5. locate aspect-ratio handling;
6. locate text-overlay handling;
7. locate camera/image preflight logic;
8. locate episode-level cache/persistence logic;
9. locate visual-plan inspection/approval commands;
10. locate any existing bulk approval-pack support.

Reuse existing abstractions whenever they are structurally suitable.

Do not introduce a parallel visual-planning architecture if the current genre pipeline already supports the required capability.

---

## Hard scope boundary

This task is only for:

- ingesting the optimized positioning-series narration pack;
- mapping it into the `veronicaBenini` genre;
- generating deterministic visual plans;
- validating visual reuse across locales;
- producing review artifacts.

Do not:

- generate images;
- call image-generation providers;
- generate TTS;
- render video;
- publish to YouTube;
- modify history-channel behavior;
- modify horror/math pipelines;
- redesign unrelated shared architecture;
- migrate unrelated schemas;
- perform broad repo refactors.

If a shared primitive must be touched, keep the change minimal and backwards-compatible.

---

# Production model

## Canonical visual ownership

Each content ID owns exactly one canonical visual plan.

Examples:

- `L01`
- `L02`
- ...
- `L06`
- `L01-S01`
- ...
- `L06-S03`

The visual plan is derived from the canonical English narration.

All other locales reuse the exact same semantic visual plan.

Locale differences may affect:

- TTS duration;
- subtitle timing;
- overlay text;
- scene hold duration;
- CTA wording.

Locale differences must **not** affect:

- subject identity;
- scene concept;
- location;
- composition;
- camera language;
- wardrobe;
- props;
- background;
- illustration concept;
- diagram topology;
- image-generation prompt;
- reference image selection.

---

## Required cache identity

A visual plan cache key must be independent of locale.

Conceptually:

`visualPlanKey = contentId + visualPlanVersion + sourceNarrationSemanticHash + genreVersion`

Do not include:

- locale;
- localized narration text hash;
- localized title;
- TTS duration.

If an existing cache-key implementation exists, adapt it minimally.

---

## Invalidation rules

A canonical visual plan should invalidate only when one of these changes:

- canonical English narration meaning changes materially;
- semantic beat structure changes;
- visual planning schema changes;
- genre visual-direction version changes;
- explicit user force/refresh is requested.

Do not invalidate when:

- narration is translated;
- punctuation changes;
- TTS voice changes;
- localized title changes;
- subtitle text changes;
- render timing changes.

Persist the invalidation reason.

---

# Camera and image preflight

Use the existing `veronicaBenini` camera/image preflight mechanism.

The preflight must run before scene planning for each content ID.

It must derive visual direction from:

- genre;
- topic;
- audience;
- narrative tone;
- contemporary time period;
- business/personal-brand context;
- content format;
- target aspect ratio;
- need for diagrams vs lifestyle scenes;
- visual continuity;
- localization reuse requirements.

For this series, the visual language should feel:

- contemporary;
- editorial;
- premium but accessible;
- business/lifestyle oriented;
- feminine without becoming stereotypically decorative;
- intelligent;
- confident;
- visually clean;
- practical rather than corporate-stock-heavy.

Avoid defaulting everything to generic laptop-at-desk imagery.

---

## Preflight persistence

Camera/image preflight output must be persisted and cached per content ID.

Do not rerun it when:

- the same visual plan is regenerated without invalidation;
- images are regenerated;
- a localized video is generated;
- only TTS timing changes.

If existing behavior already satisfies this, reuse it.

If not, patch only the minimal missing behavior.

---

# Aspect-ratio policy

## Long-form

Primary aspect ratio:

`16:9`

Plan scenes specifically for horizontal YouTube viewing.

## Shorts

Primary aspect ratio:

`9:16`

Plan scenes specifically for vertical viewing.

Do not simply crop the long-form plan into Shorts.

The Short is a separate content ID and should have its own vertical-native plan.

---

## Shared visual safe areas

For every plan, record:

- focal subject region;
- overlay-safe region;
- subtitle-safe region;
- crop-sensitive region;
- text-free image-generation requirement.

For 9:16 Shorts:

- prioritize a strong central subject;
- keep the first-frame focal point immediately legible;
- avoid important detail near top/bottom UI zones;
- avoid tiny diagrams;
- avoid wide compositions that only work in 16:9.

For 16:9 long form:

- allow more environmental context;
- use visual progression;
- use diagrams and comparative layouts where useful;
- preserve lower-third/subtitle-safe regions.

---

# Text policy

Generated images must contain **no baked-in readable text**.

This is mandatory for localization reuse.

If a scene concept needs words, labels, numbers, arrows, or a title:

1. generate the underlying image/diagram background without readable text;
2. represent text as structured overlay data;
3. localize the overlay at render time.

Use locale-neutral icons or shapes where possible.

Never ask an image model to render:

- titles;
- captions;
- UI copy;
- book-cover text;
- website text;
- social-post text;
- diagram labels.

---

# Visual storytelling rules

## Do not illustrate every sentence

Plan visuals from semantic beats, not sentence boundaries.

One visual should usually communicate a complete idea.

Avoid:

- one image per sentence;
- one image per transcript segment;
- repetitive talking-head substitutes;
- repeated laptop/phone/desk motifs;
- generic business stock scenes.

---

## Visual categories

Prefer a balanced mix of:

1. editorial business/lifestyle scenes;
2. conceptual visual metaphors;
3. simple diagrams;
4. kinetic-text-compatible layouts;
5. illustrative comparisons;
6. environmental professional scenes;
7. objects/props when meaningful;
8. interface-style compositions without baked-in text.

Target variety inside each long-form episode.

---

## Long-form pacing

For long videos, target a meaningful visual change approximately every:

`5–10 seconds`

But do not mechanically force a new asset at fixed intervals.

Use:

- camera movement;
- crop/pan;
- layered overlays;
- diagram progression;
- object emphasis;
- split-screen comparison;
- scene continuation

to avoid unnecessary image generation.

Prefer approximately:

`12–20 canonical visual assets per long-form video`

unless the existing pipeline determines a better count from narration length and semantic density.

Do not exceed this without a clear reason.

---

## Shorts pacing

For Shorts, target visual beats around:

`1.5–4 seconds`

Prefer approximately:

`5–9 canonical visual assets per Short`

depending on length.

The first visual must work as a visual hook even before the narration is fully understood.

---

# Episode-specific visual direction

## L01 — Why Better Experts Still Lose Clients

Core visual conflict:

`real expertise != perceived expertise`

Visual motifs:

- two professionals with unequal market visibility;
- strong work hidden behind weak signals;
- customer decision context;
- visible evidence accumulating around one professional;
- perception/recognition diagram;
- memory association.

Avoid making this merely a “two businesswomen at laptops” episode.

---

## L02 — Why Trying to Sell to Everyone Makes You Invisible

Core visual conflict:

`broad message -> low relevance`

Visual motifs:

- one vague signal spreading everywhere;
- one precise signal reaching the right audience;
- crowd vs focused group;
- market → problem → solution framework;
- nested niche/sub-niche visualization;
- “this is for me” recognition moment.

Use diagrams heavily enough to make the framework memorable.

---

## L03 — How to Become Known as an Expert When Nobody Knows You Yet

Core visual conflict:

`new identity -> no market recognition yet`

Visual motifs:

- day-one professional transition;
- profile/website/offer alignment;
- expertise evidence;
- coherent signals accumulating;
- UX designer → conversion consultant example;
- reputation building over time.

Show progression rather than static “expert” imagery.

---

## L04 — Stop Posting Randomly: Build Content People Remember

Core visual conflict:

`content volume != positioning`

Visual motifs:

- scattered unrelated posts;
- one coherent topic cluster;
- topic ↔ name association;
- content distribution;
- interviews/collaborations;
- nutrition-consultant example;
- memory accumulation.

This episode should have one of the strongest diagram systems in the series.

---

## L05 — How a Book Can Position You as an Expert

Core visual conflict:

`book does not create expertise -> book packages expertise`

Visual motifs:

- knowledge becoming a structured book;
- book as durable authority object;
- self-publishing/ebook without implying a specific platform;
- chapter → Short;
- framework → diagram;
- question → article;
- example → interview;
- one knowledge center feeding many formats.

Do not render readable fake book-cover titles inside generated images.

---

## L06 — Your Business Changed. Your Audience Didn't.

Core visual conflict:

`business evolution -> audience memory lag`

Visual motifs:

- old category vs new category;
- high-heels-to-digital-expertise transition as a generalized example;
- audience still holding the old association;
- bridge narrative;
- repeated new signals;
- old/new category overlap;
- market memory eventually updating.

This should feel like a transformation story, not a lecture.

---

# Short-form visual direction

Each Short must:

- preserve its own content ID;
- be planned natively for 9:16;
- use one strong visual thesis;
- avoid summarizing the entire parent long video;
- remain understandable without watching the parent;
- still visually relate to the parent through shared design language.

Do not copy the long-form scene plan wholesale.

It is acceptable to reuse a canonical asset concept from the parent only if:

- it is genuinely the best visual;
- the framing is independently suitable for 9:16;
- the reuse does not make the Short feel like a crop of the long video.

Track intentional cross-content asset reuse explicitly.

---

# Character and human-scene policy

Use human subjects where they improve comprehension or emotion.

Do not force the narrator or Veronica Benini into every scene.

Unless the repository already has approved likeness/reference-image handling for this genre:

- do not imply a specific real person;
- use representative professionals;
- keep identity consistent only within a scene sequence where continuity matters.

Avoid unrealistic “perfect influencer” imagery.

Prefer credible professional environments.

---

# Visual continuity

Within each content ID, maintain continuity for recurring subjects:

- approximate age;
- hairstyle;
- clothing;
- office/environment;
- prop continuity;
- lighting;
- camera language.

If a scene sequence reuses the same character, record a stable character description in the visual plan.

Do not require cross-episode character continuity unless the existing genre design already defines it.

---

# Diagrams

Use diagrams when they communicate the idea faster than a lifestyle image.

Suitable concepts include:

- expertise → perception → trust;
- market → problem → solution;
- broad market → niche → sub-niche;
- topic ↔ name association;
- content distribution;
- old positioning → bridge → new positioning;
- book → derivative content.

Diagrams must be stored semantically.

Example:

```json
{
  "diagramType": "flow",
  "nodes": [
    {"id": "expertise", "labelKey": "expertise"},
    {"id": "perception", "labelKey": "perception"},
    {"id": "trust", "labelKey": "trust"}
  ],
  "edges": [
    {"from": "expertise", "to": "perception"},
    {"from": "perception", "to": "trust"}
  ]
}
```

Do not bake English labels into the image prompt.

Localization should resolve `labelKey` at render time.

---

# Image prompt requirements

For every planned generated image, store:

- `assetId`
- `contentId`
- `sceneId`
- semantic purpose
- subject
- environment
- action
- composition
- camera/lens
- lighting
- mood
- era/time context
- wardrobe
- props
- aspect ratio
- negative constraints
- text-free requirement
- reuse eligibility
- continuity group
- visual evidence/source beat

Prompts must describe what the viewer needs to understand.

Avoid vague prompts such as:

“professional woman working at laptop, cinematic”

Prefer specific narrative intent.

---

# Prompt quality gate

Reject or refine an image prompt if it:

- is visually generic;
- does not communicate the narration beat;
- repeats another asset concept;
- relies on readable generated text;
- contains unnecessary brand logos;
- changes meaning across languages;
- is compositionally unsuitable for the target aspect ratio;
- uses an implausible setting;
- creates visual stereotypes;
- conflicts with the genre preflight.

---

# Repetition control

Run repetition analysis at both:

1. asset-concept level;
2. viewer-perceived scene level.

Do not reject legitimate reuse merely because two prompts share generic terms.

Detect actual repetition such as:

- same woman at laptop;
- same desk scene;
- same phone-in-hand scene;
- same talking-head substitute;
- same abstract arrows;
- same office background;
- same composition with different props.

If repetition exceeds existing `veronicaBenini` thresholds:

- improve visual diversity;
- do not weaken thresholds merely to pass;
- do not create arbitrary visual novelty disconnected from narration.

---

# Localization compatibility validation

For every planned scene, validate against all five localized narrations.

The validation question is:

> Does this visual remain semantically correct at the corresponding localized beat?

Do not require exact sentence alignment.

Allow timing drift.

If a visual only works because of an English idiom or English-specific wording:

- revise the visual concept;
- keep the narration;
- choose a language-neutral visual.

Produce a machine-readable compatibility result for every content ID.

---

# Timing model

Do not hard-bind scene boundaries to English timestamps.

Instead store:

- semantic beat ID;
- canonical English anchor;
- relative ordering;
- preferred minimum duration;
- preferred maximum duration;
- stretchability;
- cut sensitivity.

Localized rendering may then adapt scene duration to TTS.

Example:

```json
{
  "beatId": "L01-B03",
  "minDurationMs": 4500,
  "maxDurationMs": 8500,
  "stretchable": true,
  "cutSensitivity": "low"
}
```

This is required for visual reuse across languages.

---

# Plan determinism

The same unchanged source must produce the same plan hash.

Record:

- canonical source hash;
- genre version;
- preflight hash;
- planner version;
- visual plan hash;
- deterministic/non-deterministic inputs.

If LLM output is involved, normalize persisted output before hashing.

---

# Required artifacts

For each content ID, produce the normal repository-native visual-plan artifacts.

At minimum, ensure the final review output exposes:

- content ID;
- localized titles;
- format;
- canonical narration source;
- aspect ratio;
- camera/image preflight;
- semantic beats;
- scene plan;
- asset plan;
- diagram plan;
- overlay plan;
- prompt plan;
- localization compatibility;
- continuity metadata;
- reuse metadata;
- repetition metrics;
- validation result;
- deterministic plan hash.

---

# Bulk review pack

Generate one bulk review artifact for all 24 content IDs.

Prefer the repository's existing `veronicaBenini` approval/review-pack format.

Include:

- 6 long-form plans;
- 18 Short plans;
- summary manifest;
- plan hashes;
- validation report;
- localization reuse report;
- repetition report;
- asset counts;
- diagram counts;
- overlay counts;
- camera/image preflight summaries;
- warnings/blockers.

Do not include final generated images because this task stops before image generation.

If the existing review format expects image placeholders, emit explicit planned-asset placeholders rather than fake images.

---

# Validation policy

Use focused, affected-scope validation only.

Run:

1. schema validation for new/changed visual plans;
2. genre-specific unit tests affected by the change;
3. deterministic plan-hash check;
4. locale-reuse invariant check;
5. duplicate/repetition validation;
6. text-in-image prohibition validation;
7. aspect-ratio validation;
8. bulk review-pack validation.

Do not run repository-wide full test/build suites unless a directly affected dependency requires it.

If a test is known to be unrelated, do not spend time/tokens fixing it.

---

# Parallel execution

Use parallel agents only where file ownership is disjoint and safe.

Safe parallelization candidates:

- inspect existing `veronicaBenini` visual planner;
- inspect pack schemas/metadata;
- plan long-form episodes;
- plan Shorts;
- localization-compatibility validation;
- review-pack aggregation.

Do not allow multiple agents to edit the same canonical schema or shared registry concurrently.

Assign a single owner for:

- shared visual-plan schema;
- cache key logic;
- genre registry/config;
- bulk review-pack manifest.

Prefer existing schemas over editing shared primitives.

---

# Git safety

Before modification:

- inspect git status;
- do not overwrite unrelated work;
- assume another session may be editing other genres.

Do not reset, clean, stash, or revert unrelated changes.

Create a focused checkpoint commit only if the repository workflow already expects agent commits.

Otherwise leave a concise change report and exact files modified.

---

# Token discipline

Keep this task economical.

Do not:

- repeatedly reread all localized narrations;
- send all five locales to the LLM for initial visual planning;
- regenerate unchanged preflight data;
- regenerate identical plans;
- perform web research;
- launch broad exploratory agents.

Preferred flow:

1. parse metadata locally;
2. plan from canonical English;
3. compare semantic anchors against localized versions programmatically;
4. call LLM only where visual reasoning is required;
5. reuse cached outputs.

---

# Fail-closed rules

Stop or mark the content ID blocked if:

- canonical narration is missing;
- visual reuse metadata is inconsistent;
- a localized version materially changes the story meaning;
- plan schema validation fails;
- a required genre capability is absent;
- plan determinism cannot be established;
- a scene requires language-specific generated text;
- a scene cannot be made semantically valid across all five locales.

Do not silently invent missing content.

---

# Acceptance criteria

This task is complete only when:

- [ ] all 24 content IDs are discovered;
- [ ] all 6 long-form canonical visual plans exist;
- [ ] all 18 Short canonical visual plans exist;
- [ ] long-form plans are 16:9;
- [ ] Short plans are 9:16;
- [ ] camera/image preflight is persisted per content ID;
- [ ] preflight is not locale-specific;
- [ ] visual-plan cache keys are locale-independent;
- [ ] no generated-image prompt contains required readable text;
- [ ] overlays are structured and localizable;
- [ ] localized narrations reuse canonical scene semantics;
- [ ] localized TTS timing can stretch/re-time scenes without replanning;
- [ ] repetition checks pass;
- [ ] deterministic plan hashes are stable;
- [ ] focused validation passes;
- [ ] a 24-content bulk review pack is produced;
- [ ] no images were generated;
- [ ] no videos were rendered;
- [ ] no unrelated genre behavior changed.

---

# Final response

Return only a concise production report with:

1. verdict: `READY_FOR_VISUAL_REVIEW` or `BLOCKED`;
2. content IDs planned;
3. long-form plan count;
4. Short plan count;
5. canonical visual asset count;
6. diagram count;
7. localized overlay count or overlay-key count;
8. cache/reuse invariant status;
9. deterministic-hash status;
10. validation status;
11. bulk review-pack path;
12. blockers, if any;
13. exact next command/task to review the plans.

Do not generate images after completing the plan.

Stop after the visual review pack has been created.
