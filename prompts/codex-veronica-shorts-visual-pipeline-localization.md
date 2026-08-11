# Codex Prompt — Veronica Shorts Semantic Visual Planning, Image Generation, Localization, QA, Rendering & Publishing

Take the role of a **Principal TypeScript Media Pipeline Architect, Multimodal Production Systems Engineer, Localization Systems Architect, and YouTube Automation Reliability Engineer**.

You are working in an existing TypeScript monorepo that already contains a Veronica video-production pipeline.

Your task is to **plan and then implement a bounded architectural upgrade** that makes Veronica Shorts automatically reproduce the quality of a manually curated workflow:

story / narration
→ selected TTS audio
→ canonical timing
→ semantic scene segmentation
→ explicit visual treatment
→ visual bible
→ deterministic image-prompt compilation
→ reference-aware image generation
→ multimodal QA/remediation
→ localized narration/timing/events
→ rendering
→ YouTube publishing.

Do **not** create a parallel production system.

Do **not** replace working infrastructure when an existing abstraction can be extended safely.

---

# 1. Target content-pack scope

The Veronica Shorts covered by this task are located under:

`content-packs/veronica-content-pack-1/youtube-positioning-shorts-v3-50s/`

Treat this directory as the bounded content-pack scope for migration, fixtures, and acceptance validation.

Before modifying code:

1. inspect the actual directory structure;
2. discover every Short/episode under this root;
3. identify scripts, narration artifacts, selected audio, timing artifacts, scene plans, visual events, image prompts, manifests, generated images, render outputs, localization artifacts, and publishing metadata;
4. preserve existing episode IDs and directory names;
5. preserve compatible existing artifacts unless regeneration is semantically required.

Do not modify unrelated content packs.

Do not broaden scope into History, Horror, Math, or other genres except where shared production infrastructure must be modified to implement a correct reusable abstraction.

---

# 2. Canonical Veronica identity

Locate and reuse the canonical Veronica character-reference pack, expected to be under or related to:

`content-packs/veronica-character-reference-v1/`

Do not invent a generic replacement protagonist when canonical Veronica references are available.

Separate:

- **persistent Veronica identity**
- **episode-specific visual direction**

Persistent Veronica identity is authoritative for:

- facial identity;
- approximate age;
- hair;
- stable physical appearance;
- approved identity references.

Episode-level direction may define:

- wardrobe;
- environment;
- palette;
- lighting;
- photographic/editorial language;
- camera language;
- recurring motifs;
- visual mood.

An optional **episode anchor image** may establish the episode-level visual treatment, but it must never replace the canonical Veronica identity authority.

---

# 3. First action: architecture reconnaissance

Before implementation, inspect the repository and produce an implementation plan based on the actual architecture.

Locate the real code and schemas behind artifacts and concepts such as:

- `canonical-timing.v1.json`
- `scene-plan.json`
- `retimed-visual-events.json`
- `provider-image-prompts.v1.json`
- `provider-image-prompts.md`
- episode manifests
- production manifests
- semantic treatments
- semantic-quality reviews
- visual-diversity metrics
- repetition metrics
- OpenAI image adapter
- image-generation manifests
- prompt caching
- semantic-hash prompt reuse
- image-asset reuse
- multimodal QA
- remediation rounds
- TTS selection
- selected-audio hashing
- alignment / word timestamps
- localization
- localized TTS
- localized canonical timing
- subtitles/captions
- renderer
- ffmpeg composition
- YouTube upload/publish entry
- CLI composition root
- workflow orchestration
- legacy speech adapters if still active.

Do not assume filenames or module names from this prompt.

Discover them.

The plan must explicitly identify which existing components should be:

- reused unchanged;
- extended;
- deprecated;
- migrated;
- newly introduced.

Avoid duplicate abstractions.

---

# 4. Target architecture

The intended logical pipeline is:

```text
MASTER STORY / MASTER NARRATION
              ↓
        MASTER TTS
              ↓
      SELECTED MASTER AUDIO
              ↓
     CANONICAL MASTER TIMING
              ↓
      SEMANTIC SCENE PLAN
              ↓
     VISUAL TREATMENTS V1
              ↓
      VISUAL BIBLE V1
              ↓
 DETERMINISTIC PROMPT COMPILER
              ↓
 PROVIDER IMAGE PROMPTS V1
              ↓
 REFERENCE-AWARE IMAGE GENERATION
              ↓
 MULTIMODAL IMAGE QA / REMEDIATION
              ↓
     CANONICAL VISUAL ASSETS
              ↓
       LOCALIZATION LAYER
        ↙             ↘
 localized text     localized TTS
        ↓               ↓
 localized timing / subtitle events
        \               /
         \             /
          LOCALIZED VIDEO EVENTS
                  ↓
               RENDER
                  ↓
            YOUTUBE PUBLISH
```

The architecture must support visual reuse across languages wherever the visual semantics remain equivalent.

---

# 5. Architectural ownership rules

Enforce these ownership boundaries:

## LLM-owned reasoning

LLM planning may decide:

- rhetorical / semantic scene boundaries;
- semantic purpose;
- core meaning;
- viewer takeaway;
- visual thesis;
- visual strategy;
- metaphor selection;
- actor/action/state interpretation;
- emotional distinction;
- visual symbolism;
- composition intent;
- whether a diagrammatic or metaphorical treatment is warranted.

## Deterministic-code ownership

Deterministic code must own:

- artifact schemas;
- timestamp mapping;
- canonical audio authority;
- hashes;
- cache keys;
- provenance;
- prompt template compilation;
- provider request construction;
- reference resolution;
- artifact dependency invalidation;
- reuse decisions;
- localization lineage;
- language-specific timing;
- render-event generation;
- publish manifests.

The final provider prompt must not be the source of truth.

---

# 6. Semantic scene planning

Review the current Veronica scene planner.

The scene planner must segment narration by **semantic/rhetorical beats**, not punctuation, sentence count, arbitrary word count, or fixed image count.

Support semantic purposes equivalent to:

- `hook`
- `problem`
- `contrast`
- `cause`
- `consequence`
- `solution`
- `proof`
- `insight`
- `resolution`

Do not require every episode to use every purpose.

Each scene must reference an exact narration span using stable identifiers compatible with canonical timing.

Possible identifiers include:

- word range;
- aligned token range;
- narration segment ID;
- canonical sentence/span IDs.

Prefer the repository's existing alignment representation.

Do not introduce a redundant alignment format.

---

# 7. Scene-count policy

Do not hardcode nine images.

Scene count must emerge from:

1. semantic/rhetorical structure;
2. selected-audio duration;
3. visual-hold constraints;
4. hook pacing;
5. visual diversity.

For Shorts, support configurable editorial guidance approximately equivalent to:

- hook visual: ~2.5–5 seconds;
- normal visual hold: ~5–8 seconds;
- preferred visual hold: ~6–7.5 seconds;
- >9 seconds requires semantic justification.

These are planning constraints, not canonical timestamp sources.

Semantic coherence takes priority over arbitrary timing targets.

Never split an argument only to hit a target duration.

Never merge semantically distinct arguments merely to reduce image count.

---

# 8. Selected audio owns canonical timing

The final timestamps must not be estimated from words-per-minute.

Selected audio is canonical.

Required chain:

```text
semantic narration span
→ selected-audio alignment
→ deterministic start/end timestamp
```

Reuse existing selected-audio timing and hashing infrastructure.

Requirements:

- zero scene gaps;
- zero scene overlaps;
- complete narration coverage;
- deterministic boundaries;
- selected-audio hash ownership;
- existing timing epsilon preserved;
- explicit failure on selected-audio timing mismatch.

If planning occurs before audio exists:

- mark timing as provisional;
- do not pretend estimates are canonical;
- retime automatically after selected audio is available.

---

# 9. Introduce or strengthen `VisualTreatmentV1`

Add a first-class typed artifact between scene planning and provider-prompt generation.

Preferred conceptual artifact:

`visual-treatments.v1.json`

Use repository naming conventions if different.

A scene treatment should include concepts equivalent to:

```ts
type SemanticPurpose =
  | 'hook'
  | 'problem'
  | 'contrast'
  | 'cause'
  | 'consequence'
  | 'solution'
  | 'proof'
  | 'insight'
  | 'resolution';

type VisualStrategy =
  | 'literal'
  | 'metaphor'
  | 'contrast'
  | 'cause-effect'
  | 'transformation'
  | 'reaction'
  | 'diagrammatic';

interface VisualTreatmentV1 {
  readonly version: 1;
  readonly sceneId: string;
  readonly narrationRef: NarrationSpanRef;

  readonly semanticPurpose: SemanticPurpose;

  readonly coreMeaning: string;
  readonly viewerShouldUnderstand: string;
  readonly visualThesis: string;
  readonly visualStrategy: VisualStrategy;

  readonly subject: string;
  readonly action: string;
  readonly state: string;
  readonly environment: string;

  readonly symbolism: readonly string[];
  readonly emotionalState: string;
  readonly negativeConstraints: readonly string[];

  readonly composition: SceneComposition;

  readonly continuity: {
    readonly characterRequired: boolean;
    readonly identityReferenceRequired: boolean;
    readonly episodeAnchorPreferred: boolean;
  };

  readonly referenceRequirements: readonly ReferenceRequirement[];
}
```

Adapt this to existing repository conventions.

Do not use `any`.

Use strict runtime validation at artifact boundaries.

---

# 10. Semantic fidelity

Visual planning must preserve materially important distinctions.

Example narration:

> They may simply be confused about how you got there.

Correct semantic interpretation:

- confusion;
- uncertainty;
- missing context.

Incorrect interpretation:

- rejection;
- hostility;
- anger;
- business failure.

The treatment schema must carry enough structure to preserve this distinction through prompt compilation.

Use fields such as:

- `emotionalState`
- `negativeConstraints`
- `viewerShouldUnderstand`

The image prompt must communicate what the viewer should understand, not merely reuse nouns from the narration.

---

# 11. Visual-thesis generation

For each scene, derive a concise visual thesis.

Example:

Narration meaning:

> Repositioning requires explaining the connection between the old identity and the new identity.

Visual thesis:

`OLD IDENTITY → BRIDGE → NEW IDENTITY`

Possible treatment:

Veronica crosses an elegant metaphorical bridge from the old professional identity toward the new one.

This metaphor must be chosen by the semantic visual planner.

Do not hardcode the bridge metaphor in production logic.

Use it only as an acceptance fixture/example.

---

# 12. Visual strategy selection

The visual planner should explicitly choose a strategy rather than defaulting every scene to generic lifestyle photography.

Possible strategies include:

### Literal
Directly show the described action or environment.

### Metaphor
Translate an abstract business idea into a visually obvious metaphor.

### Contrast
Present old/new, before/after, internal/external, or two audience perspectives.

### Cause-effect
Show a visual relationship between a cause and its consequence.

### Transformation
Show transition from one identity/state to another.

### Reaction
Show a controlled audience response such as confusion, recognition, surprise, or understanding.

### Diagrammatic
Use an intentionally structured visual representation when spatial or relational reasoning is clearer than a photographic scene.

Avoid repetitive use of the same strategy in adjacent scenes unless editorially justified.

---

# 13. `VisualBibleV1`

Create or reuse a typed visual-bible artifact.

Separate persistent Veronica identity from episode-level visual direction.

The visual bible should support concepts equivalent to:

```ts
interface VisualBibleV1 {
  readonly version: 1;

  readonly characterIdentity: CharacterIdentityRef;

  readonly wardrobe: WardrobeDirection;
  readonly palette: readonly string[];
  readonly lighting: string;
  readonly editorialStyle: string;
  readonly environmentDefaults: readonly string[];
  readonly recurringMotifs: readonly string[];

  readonly output: {
    readonly aspectRatio: '9:16';
    readonly subtitleSafeArea: SubtitleSafeArea;
    readonly readableGeneratedTextAllowed: boolean;
    readonly logosAllowed: boolean;
    readonly watermarksAllowed: boolean;
  };

  readonly continuityPolicy: ContinuityPolicy;
}
```

Reuse existing genre configuration where possible.

Do not duplicate aspect-ratio or subtitle-safe-area configuration if already modeled centrally.

---

# 14. Character/reference policy

The image-generation system must resolve references deliberately.

Reference priority should conceptually be:

1. canonical Veronica identity references;
2. optional episode anchor;
3. scene-specific approved reference assets.

Record resolved references in image-generation provenance.

An episode anchor may establish:

- wardrobe;
- environment;
- lighting;
- palette;
- camera language.

The canonical Veronica reference pack remains identity authority.

---

# 15. Deterministic image-prompt compiler

Provider image prompts must be compiled from structured inputs.

Input:

```text
VisualTreatmentV1
+
VisualBibleV1
+
provider profile
+
resolved references
+
output policy
```

Output:

`provider-image-prompts.v1.json`

Do not make the final prompt an unconstrained second LLM rewrite.

Prompt compilation should be a pure or near-pure deterministic transformation.

The compiled prompt should clearly contain:

- series/episode continuity;
- scene index;
- scene title if available;
- semantic meaning;
- viewer takeaway;
- visual thesis;
- visual strategy;
- subject;
- action;
- state;
- environment;
- symbolism;
- emotional state;
- negative constraints;
- framing/composition;
- character invariants;
- reference policy;
- aspect ratio;
- subtitle-safe area;
- text/logo/watermark policy.

---

# 16. Prompt provenance

Each compiled provider prompt must retain enough typed provenance to answer:

- which master story produced it;
- which narration version produced it;
- which scene-plan version produced it;
- which visual treatment produced it;
- which visual bible produced it;
- which prompt compiler version produced it;
- which selected-audio hash owns timing;
- which character references were resolved;
- whether an episode anchor was used;
- which provider/model/settings were requested.

Use existing hash utilities.

Do not implement another hashing stack.

---

# 17. Cache and image reuse

Integrate with existing:

- prompt caching;
- semantic-hash prompt reuse;
- image-asset reuse.

Do not build a parallel cache.

Cache identity should include semantically meaningful inputs such as:

- treatment hash;
- visual-bible hash;
- prompt-compiler version;
- provider profile;
- model/settings;
- canonical character-reference hashes;
- episode-anchor hash when used;
- scene-specific reference hashes;
- compiled provider-prompt hash.

A timing-only change must not invalidate an image if:

- narration semantics are unchanged;
- scene treatment is unchanged;
- visual bible is unchanged;
- references are unchanged.

A semantic treatment change must invalidate the affected prompt/image.

A single-scene change must not invalidate unrelated scenes.

---

# 18. Pre-generation QA

Before any paid image call, validate at least:

### Semantic coverage
Every important narration claim is represented.

### Semantic fidelity
Visual meaning does not contradict narration.

### Actor/action/state
Every scene has enough concrete visual information.

### Visual specificity
Avoid generic prompts such as "businesswoman working."

### Visual diversity
Adjacent scenes must not be effectively identical compositions.

### Continuity
Required identity/style references resolve successfully.

### Timing
Canonical selected-audio coverage has no gaps or overlaps.

### Subtitle safety
Important visual information avoids subtitle territory.

### Text safety
Generated readable text is forbidden unless explicitly requested.

### Provider readiness
Provider prompt and reference set are complete.

Known-blocked scenes must not trigger paid image generation.

---

# 19. Image generation

Reuse the repository's existing OpenAI image adapter.

Do not introduce a second OpenAI image client unless the existing adapter cannot satisfy the required reference-aware workflow.

Required semantics:

### First scene / optional episode anchor

Use canonical Veronica references.

Create an episode anchor only if configured or useful.

### Later scenes

Use:

- canonical Veronica identity references;
- episode anchor when configured;
- scene-specific references when required;
- compiled scene prompt.

Persist the resolved reference set.

Image generation must be idempotent with respect to cache identity.

---

# 20. Post-generation multimodal QA

Reuse existing multimodal QA/remediation infrastructure.

Evaluate at least:

- semantic fit;
- character identity consistency;
- visual-bible consistency;
- composition;
- visual quality;
- unwanted generated text;
- anatomical/generation defects;
- repetition with adjacent scenes;
- mismatch between intended emotional state and generated emotional state.

Example:

If treatment requires `confused, not rejecting`, a hostile audience image must fail semantic QA.

Preserve bounded remediation.

Do not introduce unlimited regeneration loops.

---

# 21. Localization must be first-class architecture

Localization is part of this task.

Do not bolt localization onto the renderer as a final string replacement.

Inspect the existing localization architecture and preserve compatible behavior.

The master semantic plan should remain language-independent wherever possible.

Conceptually separate:

```text
MASTER SEMANTICS
from
LOCALIZED LANGUAGE REALIZATION
```

The same canonical visual scene may normally serve multiple languages.

---

# 22. Localization source of truth

Determine the repository's existing localization source-of-truth policy.

Prefer an architecture equivalent to:

```text
master story / master narration
          ↓
master semantic scene plan
          ↓
master visual treatments
          ↓
canonical image assets
          ↓
localized narration
          ↓
localized TTS
          ↓
localized canonical timing
          ↓
localized subtitle / visual events
          ↓
localized render
```

The master-language selected audio must not incorrectly own localized timing.

Each localized selected audio must own its own language-specific timing.

---

# 23. Localized narration

For every supported locale, preserve semantic equivalence to the master story.

Localization must not silently alter:

- argument structure;
- claims;
- semantic purpose;
- visual thesis;
- emotional distinction;
- CTA meaning;
- brand terminology.

Use existing localization QA if present.

If no adequate semantic-localization QA exists, extend the current architecture minimally.

Do not build a full translation platform.

---

# 24. Localized timing

Every localized audio track must produce its own canonical timing artifact or equivalent language-specific timing state.

Do not copy master-language timestamps.

Required chain:

```text
localized narration
→ localized selected audio
→ localized alignment
→ localized canonical timing
→ localized subtitles/events
```

A German or Italian narration that takes longer than English must shift visual event boundaries without regenerating semantically unchanged images.

---

# 25. Visual reuse across locales

Images should be reused across locales by default when:

- semantic scene meaning is unchanged;
- visual treatment is unchanged;
- no localized readable text appears inside the image;
- no locale-specific cultural adaptation is required.

Therefore localization must usually change:

- narration audio;
- timestamps;
- subtitles;
- text overlays;
- localized metadata;
- possibly CTA overlays.

Localization should **not** normally regenerate:

- scene images;
- character references;
- visual treatments;
- visual bible.

This must be reflected in cache invalidation.

---

# 26. Locale-specific visual adaptation

Support an explicit escape hatch for rare locale-specific visual differences.

Examples:

- locale-specific UI screenshot;
- localized diagram text;
- culturally inappropriate imagery;
- locale-specific legal or product context.

Model this as an explicit visual override.

Do not infer regeneration merely because locale changed.

A locale should invalidate image generation only when a visual dependency actually differs.

---

# 27. Text inside generated images

For this Veronica Shorts pipeline, generated readable text should default to forbidden.

Reason:

- improves cross-locale asset reuse;
- avoids image-model text errors;
- keeps localization deterministic;
- allows text/subtitles to remain renderer-owned.

Any visible localized text should preferably be rendered later by the video composition layer.

If the existing pipeline supports text-bearing diagrams, preserve that as an explicit exception with locale-aware cache identity.

---

# 28. Subtitle architecture

Subtitles/captions must derive from localized narration and localized timing.

Do not derive localized subtitle times from the master audio.

Respect:

- platform-safe margins;
- existing caption segmentation policy;
- subtitle-safe visual composition;
- 9:16 framing.

The image-prompt compiler should reserve the lower-third region according to the existing renderer policy.

---

# 29. Localized visual-event retiming

The canonical semantic scene order should normally remain stable across locales.

However, actual event timing must be retimed to each locale's selected audio.

Conceptually:

```text
semanticSceneId
→ localized narration span
→ localized word alignment
→ localized scene start/end
```

If scene semantic order changes because a translation genuinely restructures the narration, detect and block rather than silently misaligning assets.

---

# 30. Localization provenance

For each localized production, persist enough provenance to answer:

- source master story hash;
- source master narration hash;
- locale;
- localized narration hash;
- translation/localization version;
- localized selected-audio hash;
- localized timing hash;
- semantic scene-plan hash;
- visual-treatment hash;
- reused image asset IDs/hashes;
- localized subtitle hash;
- localized render manifest hash.

Use existing manifest conventions where possible.

---

# 31. Localization cache behavior

Required invalidation behavior:

### Translation-only wording improvement, same semantics
May require:
- localized TTS regeneration;
- localized timing regeneration;
- localized subtitle regeneration;
- localized render regeneration.

Must not automatically require:
- scene replanning;
- visual-treatment regeneration;
- image regeneration.

### Master semantic change
Must invalidate:
- affected scene treatment;
- affected provider prompt;
- affected image when semantics changed;
- all localized narration derived from that master semantic content;
- affected localized timings/renders.

### Timing-only localized audio change
Must invalidate:
- localized timing/events;
- localized subtitle timing;
- localized render.

Must preserve:
- canonical image assets.

---

# 32. Localized YouTube publishing

Inspect the current YouTube publishing path.

Ensure localized outputs remain compatible with the existing publication model.

Where supported by current architecture, localized publishing metadata should remain separate from visual-production semantics.

Potential localized publication fields include:

- title;
- description;
- tags;
- captions/subtitles;
- localized rendered video;
- thumbnail metadata if thumbnails are locale-specific.

Do not redesign the publishing system beyond what is required for correct integration.

---

# 33. Artifact chain

After implementation, each master Short should expose a coherent artifact chain equivalent to:

```text
master story / script

selected master audio
canonical master timing

scene-plan.json
visual-treatments.v1.json
visual-bible.v1.json
provider-image-prompts.v1.json
image-generation-manifest.json

generated/
  scene assets

retimed master visual events
master render manifest

locales/
  <locale>/
    localized narration
    selected localized audio
    localized canonical timing
    localized subtitle/caption data
    localized visual events
    localized render manifest
    localized publish manifest
```

Do not force this exact folder structure if the repository already has a stronger convention.

The important requirement is the dependency model and provenance.

---

# 34. Review-pack integration

The existing Veronica review-pack generator must expose enough artifacts to audit the new pipeline.

Include, where applicable:

- master narration;
- localized narrations;
- selected-audio metadata;
- canonical timing;
- scene plan;
- visual treatments;
- visual bible;
- provider image prompts;
- resolved image references;
- image-generation manifest;
- generated assets or asset references;
- pre-generation QA;
- post-generation QA;
- remediation history;
- diversity/repetition metrics;
- localized timing;
- localized visual events;
- cache/reuse decisions;
- cross-artifact hashes.

Avoid unnecessary duplication.

If review packs are currently oversized, reference large immutable assets where the review tooling supports it rather than copying duplicates.

---

# 35. CLI integration

Wire the architecture into the normal Veronica production command path.

Do not leave new stages as library-only code.

The normal preparation flow should conceptually execute:

```text
prepare narration
→ generate/select audio
→ canonical timing
→ semantic scene planning
→ visual treatment planning
→ visual bible resolution
→ deterministic provider prompt compilation
→ pre-generation QA
```

Image generation then executes:

```text
resolve cache/reuse
→ resolve references
→ generate only required images
→ post-generation QA
→ bounded remediation
```

Localization then executes:

```text
localize narration
→ localized TTS
→ localized canonical timing
→ localized visual-event retiming
→ localized subtitles
→ localized rendering
```

Publishing consumes validated localized render/publish artifacts.

Preserve dry-run and offline-fixture modes.

---

# 36. Migration compatibility

Existing episodes and fixtures should remain readable where practical.

If an old provider-image prompt has no `VisualTreatmentV1` provenance:

- do not silently claim it does;
- either generate a clearly marked legacy-derived treatment;
- or require clean replanning according to repository compatibility rules.

Do not corrupt historical manifests.

Do not rewrite unrelated content packs.

---

# 37. TypeScript implementation standards

Use production-grade TypeScript.

Requirements:

- strict types;
- no `any`;
- readonly immutable domain structures where practical;
- discriminated unions;
- exhaustive switches;
- runtime validation at artifact/provider boundaries;
- pure transformations separated from provider I/O;
- deterministic serializers where hashes depend on serialized data;
- typed domain errors;
- explicit artifact versioning;
- concise documentation for non-obvious invariants.

Avoid massive service classes.

Prefer focused modules with clear ownership.

---

# 38. Observability

Integrate with existing logging/telemetry.

At minimum, log structured events for:

- scene planning;
- treatment planning;
- prompt compilation;
- cache hit/miss;
- asset reuse;
- reference resolution;
- image generation;
- QA result;
- remediation result;
- localization generation;
- localized TTS selection;
- localized retiming;
- localized render readiness.

Do not log secrets or full credentials.

Avoid logging full provider payloads where they may contain unnecessary sensitive data.

---

# 39. Cost safety

No paid provider calls during implementation unless explicitly requested.

Tests must never trigger live paid calls.

Acceptance preparation should stop before paid image generation.

Expose:

- planned paid image-call count;
- reused-image count;
- cache-hit count;
- blocked-scene count.

Localization should demonstrate that shared visuals do not multiply image cost by language count.

---

# 40. Focused tests

Follow the repository's risk-based validation policy.

Run only affected/focused validation unless a wider gate is genuinely required.

Add focused tests covering:

## Scene planning

- semantic segmentation does not depend purely on punctuation;
- scene count is not hardcoded;
- semantically distinct beats remain separate;
- no canonical timing is derived from WPM estimates.

## Timing

- selected audio owns timing;
- no gaps;
- no overlaps;
- complete coverage;
- deterministic retiming.

## Visual treatments

- schema validation;
- exhaustive semantic purpose handling;
- exhaustive visual strategy handling;
- `confusion` is preserved as confusion;
- negative constraint `not rejection/hostility` survives.

## Prompt compiler

- deterministic output;
- same inputs → same prompt/hash;
- treatment change → affected prompt changes;
- unrelated scene remains stable;
- subtitle-safe policy appears;
- no generated-readable-text policy appears.

## Character/reference handling

- canonical Veronica references resolve;
- episode anchor does not replace identity authority;
- scene-specific reference composition is deterministic.

## Cache/reuse

- timing-only change preserves image reuse;
- localized timing-only change preserves image reuse;
- locale change alone does not invalidate image;
- semantic visual override does invalidate image;
- single-scene change invalidates only that scene.

## Localization

- localized narration preserves scene IDs;
- localized selected audio owns localized timing;
- master timing is never reused as localized canonical timing;
- images are reused across locales when semantics match;
- localized subtitles derive from localized timing;
- translated wording changes do not force image regeneration;
- master semantic changes propagate invalidation correctly.

## QA

- known blocked scene does not make paid image call;
- hostile audience fails a `confused, not rejecting` treatment;
- repetitive adjacent visual composition is detected where current QA supports it.

No live paid OpenAI calls.

Use fixtures/mocks.

---

# 41. Representative acceptance fixture

Use one representative Short from:

`content-packs/veronica-content-pack-1/youtube-positioning-shorts-v3-50s/`

Prefer an episode with semantics equivalent to:

1. **HOOK** — the business changed but the audience may not have noticed;
2. **PROBLEM** — existing followers still associate the creator with an old identity;
3. **CONTRAST** — new followers understand the current identity faster;
4. **CAUSE** — existing followers accumulated years of old signals;
5. **CONSEQUENCE** — the new offer creates confusion rather than rejection;
6. **SOLUTION** — repositioning needs a bridge;
7. **PROOF** — old skills make the new direction credible;
8. **INSIGHT** — an internally obvious evolution can look random externally;
9. **RESOLUTION** — positioning changes only when the audience association changes.

Do not hardcode this story into production logic.

---

# 42. Bridge-scene acceptance behavior

For the semantic scene:

> Repositioning needs a bridge.

The treatment should demonstrate reasoning equivalent to:

```json
{
  "semanticPurpose": "solution",
  "coreMeaning": "The audience needs an explicit connection between the previous identity and the new identity.",
  "viewerShouldUnderstand": "The new direction is an evolution, not an unrelated pivot.",
  "visualThesis": "OLD IDENTITY → BRIDGE → NEW IDENTITY",
  "visualStrategy": "metaphor",
  "emotionalState": "clarity and forward movement"
}
```

The visual treatment may choose a literal/metaphorical bridge.

Do not require that exact wording.

The acceptance requirement is that an abstract strategic concept becomes a strong visual idea rather than generic office imagery.

---

# 43. Confusion-scene acceptance behavior

For narration equivalent to:

> They may simply be confused about how you got there.

The treatment must preserve:

```text
confusion
uncertainty
missing context
```

and reject interpretations equivalent to:

```text
hostility
anger
rejection
business failure
```

This distinction must survive into the compiled provider prompt and post-generation QA criteria.

---

# 44. Acceptance execution

After shared implementation is complete:

1. select one representative Short in the target pack;
2. run production preparation through provider-prompt generation;
3. keep paid image generation disabled;
4. generate/update all intermediate typed artifacts;
5. validate cross-artifact provenance;
6. validate selected-audio timing authority;
7. validate canonical Veronica reference resolution;
8. validate visual-treatment quality;
9. validate deterministic provider prompts;
10. run at least one configured localization through localized narration/timing/event preparation if fixtures/providers permit without paid calls.

Do not regenerate the entire pack yet.

---

# 45. Acceptance assertions

Report whether all of the following are true:

- selected audio owns canonical master timestamps;
- localized selected audio owns localized timestamps;
- scene boundaries follow semantic beats;
- scene count is not hardcoded;
- every scene has a typed visual treatment;
- strong metaphors are possible;
- confusion vs rejection survives;
- canonical Veronica identity references resolve;
- provider prompts are deterministic;
- provider prompts derive from structured treatments;
- timing-only changes preserve eligible image reuse;
- locale-only timing changes preserve image reuse;
- localized text does not force image regeneration by default;
- localization does not multiply image-generation costs unnecessarily;
- existing renderer can consume localized visual events;
- existing publishing path can consume localized output without manual workaround.

---

# 46. Do not perform these actions

Do not:

- make paid image-generation calls;
- upload videos to YouTube;
- publish videos;
- regenerate the entire pack;
- redesign unrelated genres;
- introduce a second cache;
- introduce a second timing authority;
- introduce a second image adapter without strong evidence;
- hardcode the nine-scene example;
- hardcode English timestamps into localized variants;
- embed generated text into images by default;
- use word-count timing as production truth;
- remove existing provenance;
- weaken existing validation gates;
- run repository-wide test/build suites unless risk escalation requires it.

---

# 47. Plan-mode deliverable

Before implementation, produce a concise but technically complete plan containing:

## Existing architecture map

Identify real modules/files responsible for:

- narration;
- TTS;
- canonical timing;
- scene planning;
- visual treatment if already present;
- prompt generation;
- image provider;
- reference images;
- cache/reuse;
- QA;
- remediation;
- localization;
- subtitles;
- renderer;
- YouTube publishing;
- CLI composition.

## Gap analysis

For each requirement in this prompt, classify:

- already satisfied;
- partially satisfied;
- missing;
- conflicting with current architecture.

## Proposed change set

List exact modules/files likely to change.

Prefer extension over replacement.

## Artifact dependency graph

Show the before/after artifact graph, including localization.

## Invalidation model

Explicitly describe what invalidates:

- semantic scene plan;
- visual treatment;
- provider prompt;
- image asset;
- localized narration;
- localized TTS;
- localized timing;
- localized render.

## Migration strategy

Explain compatibility with existing Shorts.

## Validation plan

List only focused tests/checks needed.

## Risks

Identify correctness, cost, consistency, migration, and localization risks.

Do not edit files during the planning phase.

---

# 48. Implementation behavior after plan approval

After the plan is approved:

- implement the approved architecture;
- keep scope bounded;
- preserve existing abstractions;
- update the plan if repository discoveries invalidate an assumption;
- make small coherent commits/changes where the workflow supports them;
- run focused tests incrementally;
- do not continue past a hard blocker by inventing behavior.

---

# 49. Final implementation report

At completion provide:

## Changed files

List changed/added files and purpose.

## Architecture changes

Explain the final dataflow.

## New/changed schemas

Show the important TypeScript contracts.

## Localization architecture

Explain:

- master semantics;
- localized narration;
- localized timing;
- visual reuse;
- localized event generation;
- cache invalidation.

## Migration implications

State whether existing episodes require replanning/regeneration.

## Cache/reuse behavior

Explain exactly what is reused and invalidated.

## Tests run

List focused tests and results.

## Acceptance run

State which representative Short was used and which artifacts were produced.

## Provider calls

State explicitly whether any paid call occurred.

Expected answer for this task should be zero unless explicitly authorized later.

## Example artifacts

Include:

1. one example `VisualTreatmentV1` for the bridge scene;
2. one example compiled provider prompt for that scene;
3. one example locale-specific timing/reuse record demonstrating that a localized audio change retimes visuals without regenerating the image.

## Remaining risks

List only real remaining issues.

---

# 50. Definition of done

This task is complete only when the normal Veronica production architecture can support:

```text
master story
→ master selected audio
→ semantic scenes
→ typed visual treatments
→ canonical Veronica visual identity
→ deterministic image prompts
→ reference-aware image generation
→ QA/remediation
→ shared visual assets
→ localized narration
→ localized selected audio
→ localized timing
→ localized subtitles/events
→ localized render
→ existing YouTube publishing flow
```

with:

- selected audio as timing authority;
- semantic fidelity;
- deterministic provenance;
- bounded remediation;
- reference-aware character continuity;
- cache-aware image reuse;
- localization-aware invalidation;
- no unnecessary image regeneration per language;
- no manual workaround between stages.

Keep the implementation architecture-first, typed, auditable, deterministic where appropriate, and compatible with the existing Veronica production system.
