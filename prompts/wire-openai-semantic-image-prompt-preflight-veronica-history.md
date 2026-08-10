IMPORTANT: A previous Cursor task implementing the Veronica-only
OpenAI Semantic Image-Prompt Preflight was interrupted intentionally.

Treat all current uncommitted Veronica changes as valuable WIP.

Before editing:
1. inspect git status and diff;
2. determine exactly what the interrupted task already implemented;
3. preserve correct completed work;
4. do not revert or redo working functionality;
5. refactor the existing Veronica implementation into the shared
   semantic-image-prompt core only where necessary;
6. then add the History adapter;
7. preserve unrelated concurrent changes.

Do not restart the implementation from scratch.
Minimize edits and token use.

# Cursor Prompt — Wire OpenAI Semantic Image-Prompt Preflight into Both `veronicaBenini` and History

## Role

Act as a senior multimodal YouTube production-pipeline architect, documentary visual director, and TypeScript engineer.

Extend the OpenAI Semantic Image-Prompt Preflight so it is a **shared reusable capability** used by:

1. the existing `veronicaBenini` genre pipeline; and
2. the History channel pipeline.

The goal is to improve semantic relevance of generated images while preserving each genre's existing visual-planning rules.

Do not create two duplicated implementations.

Do not generate paid images in this task.

---

# Core architecture

Implement or refactor toward:

```text
                    shared semantic-image-prompt core
                                 │
                 ┌───────────────┴────────────────┐
                 │                                │
       veronicaBenini adapter              history adapter
                 │                                │
      business/positioning rules       historical-grounding rules
                 │                                │
                 └───────────────┬────────────────┘
                                 │
                      canonical semantic brief
                                 │
                    deterministic prompt assembler
                                 │
                         existing image generator
```

Shared core responsibilities:

- OpenAI request execution;
- strict structured output;
- schema validation;
- caching;
- invalidation;
- retry/failure policy;
- prompt assembly primitives;
- semantic quality validation;
- CLI/debug plumbing;
- observability;
- review-pack summaries.

Genre adapters own genre-specific semantic constraints.

---

# Existing Veronica behavior

Preserve the intended Veronica behavior from the previous task:

```text
canonical contentId
+ canonical narration
+ approved semantic beats
+ approved visual plan
        ↓
one OpenAI semantic-preflight call
        ↓
cached semantic image brief
        ↓
deterministic final prompts
        ↓
images generated once
        ↓
EN / DE / IT / FR / PT reuse
```

Do not regress:

- multilingual image reuse;
- locale-independent cache identity;
- hook visual diversity;
- long-form similarity gates;
- native 16:9 / 9:16 planning;
- text-free generated imagery;
- camera/image preflight caching.

---

# History objective

Add the same semantic-image-prompt preflight to History, but with **documentary factual grounding**.

For every canonical History episode:

```text
trusted/approved canonical narration
+ approved History visual plan
+ approved historical context
+ evidence/entity/geography metadata already available
        ↓
OpenAI history semantic-image-prompt preflight
        ↓
cached History semantic prompt brief
        ↓
deterministic final asset prompts
        ↓
existing History image/map/diagram/reference-image pipeline
```

The semantic preflight must make images more relevant to the narration.

It must NOT become another historical research system.

---

# Hard History rule

The semantic-preflight model is a **visual interpreter**, not a fact generator.

It may:

- explain what a narration beat visually means;
- identify the visual relationship;
- choose relevant actions already supported by the story;
- make approved factual details explicit for the image generator;
- reject generic documentary imagery;
- connect subject, action, environment, composition, and historical context.

It may NOT:

- invent historical facts;
- invent dates;
- invent locations;
- invent uniforms;
- invent weapons or technology;
- invent insignia;
- invent architecture;
- invent participant identities;
- invent troop movements;
- invent map geometry;
- invent weather/season when not supported;
- invent quotations;
- introduce unsupported causal claims;
- reinterpret evidence.

If required detail is absent from canonical/approved source material:

```text
fail closed or omit the unsupported detail
```

Do not fill gaps from model memory.

---

# Source-of-truth hierarchy for History

Inspect the existing History pipeline and reuse its actual repository terminology.

Conceptually, input authority should be:

1. approved/trusted canonical narration;
2. approved visual plan / semantic intent;
3. frozen research or evidence snapshot if the episode has one;
4. approved entity-resolution output;
5. approved geography/map data;
6. approved historical-figure reference metadata;
7. camera/image preflight;
8. existing continuity / treatment metadata.

Do not trigger fresh historical research merely to produce an image prompt.

If History is in `trusted_script` mode, respect it.

Do not re-enable live claim extraction/research as a side effect.

---

# Shared call granularity

Default:

```text
1 semantic-preflight OpenAI call per canonical content ID / episode
```

The call should return briefs for all image-generation assets for that content ID.

For History:

```text
one canonical episode
≈ one semantic-preflight call on a cold cache
```

NOT:

```text
one call per image
```

and NOT:

```text
one call per localization
```

If a History episode has too many assets for the existing structured-output limits, support a deterministic fallback:

```text
content-level manifest call
+ deterministic semantic-beat chunks
```

Only use chunking when technically necessary.

Chunk boundaries must be deterministic and cacheable.

Do not default to per-image calls.

---

# Shared schema

Prefer a common base schema with genre-specific extensions.

Example:

```ts
type SemanticImagePromptBriefV1 = {
  schemaVersion: 1;
  genre: "veronicaBenini" | "history";

  contentId: string;
  sourceSemanticHash: string;
  visualPlanHash: string;

  contentThesis: string;
  viewerPromise: string;

  visualDirection: {
    coreStoryLogic: string;
    emotionalArc: string;
    realismLevel: string;
    overallVisualLanguage: string[];
    forbiddenDrift: string[];
  };

  assets: SemanticAssetBriefV1[];

  genreContext:
    | VeronicaSemanticContextV1
    | HistorySemanticContextV1;
};
```

Common asset structure:

```ts
type SemanticAssetBriefV1 = {
  assetId: string;
  beatId: string;

  narrativePurpose:
    | "hook"
    | "problem"
    | "proof"
    | "comparison"
    | "explanation"
    | "method"
    | "transition"
    | "payoff"
    | "event"
    | "location"
    | "movement"
    | "evidence"
    | "other";

  spokenMeaning: string;
  viewerTakeaway: string;
  instantRead: string;

  visualRelationship:
    | "decision"
    | "comparison"
    | "hidden-vs-visible"
    | "cause-effect"
    | "before-after"
    | "progression"
    | "selection"
    | "transformation"
    | "network"
    | "evidence"
    | "event"
    | "movement"
    | "spatial"
    | "other";

  mustShow: string[];
  mustNotShow: string[];

  subjectRoles: string[];
  environmentIntent: string;
  actionIntent: string;
  objectIntent: string[];

  conceptualComposition: string;

  relevanceAnchors: string[];
  genericDriftRisks: string[];

  generationBasePrompt: string;
};
```

Use existing repository types if equivalent.

Do not add redundant parallel models.

---

# History semantic context

Add History-only fields only where they materially improve generation safety.

Conceptually:

```ts
type HistorySemanticContextV1 = {
  period?: {
    startYear?: number;
    endYear?: number;
    displayEra?: string;
  };

  geography?: {
    placeIds: string[];
    canonicalPlaceNames: string[];
  };

  entities?: {
    entityIds: string[];
    approvedDisplayNames: string[];
  };

  historicalFigures?: {
    entityId: string;
    referenceEligible: boolean;
    referenceAssetId?: string;
  }[];

  materialCulture?: {
    approvedDetails: string[];
    prohibitedAnachronisms: string[];
  };

  evidence?: {
    evidenceIds: string[];
    confidenceMode?: string;
  };

  assetMode?: "reenactment" | "map" | "diagram" | "object" | "document" | "environment";
};
```

Do not require fields that the History pipeline does not currently know.

Optional data must remain optional.

---

# History semantic ownership

The History semantic preflight MAY own:

- visual meaning of the beat;
- viewer takeaway;
- visual action already supported by narration;
- which approved details are essential to show;
- what would make the image generic or misleading;
- framing of cause/effect or event relationships;
- generation-base-prompt semantics.

It MUST NOT override:

- factual claim content;
- approved entity identity;
- approved chronology;
- approved geography;
- approved map geometry;
- approved diagram semantics;
- camera preflight;
- continuity constraints;
- historical reference-image decisions;
- aspect ratio;
- provider configuration.

---

# History anti-drift rules

Add a History adapter prompt policy.

The semantic model must avoid generic historical imagery such as:

```text
generic medieval battlefield
generic old map
generic Roman soldier
generic Victorian explorer
generic dramatic king portrait
generic smoky war scene
generic ancient city
```

unless that genericity is genuinely sufficient for the narration beat.

Prefer:

- the correct event;
- correct actor roles;
- correct place;
- correct historical period;
- correct action;
- correct relationship;
- correct material setting;
- correct documentary visual purpose.

A beautiful historical image that communicates the wrong event is a failure.

---

# History relevance test

Every image-generation prompt should pass:

> If narration were muted, would this image still communicate the correct historical beat rather than merely "look historical"?

Examples:

Bad:

```text
Napoleonic soldiers marching dramatically through snow
```

if the beat is specifically about:

```text
supply collapse caused by retreat logistics
```

Better:

```text
a retreating column with visibly abandoned supply wagons,
exhausted horses, broken logistics chain, scattered provisions,
period-correct winter road and clothing,
showing the army's supply system physically failing
```

Only include details supported by the approved source context.

---

# History chronology rules

If year/period metadata exists:

- pass it to the semantic preflight;
- project it into the final image prompt;
- use it to constrain architecture, clothing, weapons, transport, interiors, and material culture.

If only a broad era is known:

- use the broad era;
- do not fabricate an exact year.

If chronology is unknown:

- omit exact chronology rather than guess.

Add a validation finding for prompts introducing an unsupported specific year.

---

# History geography rules

If a beat is location-sensitive:

- use approved canonical geography;
- preserve canonical place IDs/names;
- ensure environmental prompts reflect the approved location where useful.

Do not allow the semantic model to substitute a "similar" place.

Example:

```text
approved: Berezina River
```

must not become:

```text
generic frozen Russian river
```

when the exact place is important.

For generic environment beats where exact geography is not narratively relevant, avoid over-constraining.

---

# Historical entity rules

For named historical figures:

- preserve the approved entity identity;
- never silently substitute another figure;
- never change age/role/side based on model inference;
- retain entity-resolution metadata.

The semantic brief may state why the figure is visually relevant.

Actual reference-image attachment remains owned by the existing History reference-image subsystem.

Do not send figure reference images into the semantic text call unless the existing architecture explicitly requires it.

---

# Historical reference-image invariant

Preserve the previously implemented rule:

```text
historical figure reference image
→ attach only when relevant
```

The semantic preflight may return:

```text
referenceRelevance = required | useful | unnecessary
```

only if this maps cleanly to existing reference-image logic.

It must not bypass the existing entity-resolution/reference eligibility gate.

Final image generation receives a historical reference only when both:

1. entity/reference system says it is approved/relevant; and
2. the asset actually depicts that figure.

---

# History maps

Semantic image-prompt preflight must NOT rewrite map semantics.

For map assets:

- do not use the normal photorealistic `generationBasePrompt` path as authority;
- preserve the existing History map renderer/adapter;
- use semantic preflight only to clarify:
  - narrative purpose;
  - what movement/location/comparison must be emphasized;
  - which approved geography is relevant;
  - what the viewer should understand.

Do not allow the model to invent:

- coordinates;
- borders;
- routes;
- arrows;
- territory extents;
- labels;
- distances.

Map geometry comes from approved deterministic/geospatial data.

---

# History diagrams

Same principle for diagrams.

Semantic preflight may clarify:

- causal relationship;
- sequence;
- dependency;
- policy-response;
- evidence-set;
- temporal relation.

It must not change approved graph topology merely for aesthetics.

The existing proposition-derived diagram system remains authoritative.

No unsupported evidence or causal edges may be added.

---

# History documents / artifacts

For historical document or artifact scenes:

- use approved object identity if known;
- do not invent text;
- do not request legible generated quotations;
- preserve text-free image policy unless the pipeline renders authenticated document text separately.

If a real document is referenced but no approved visual reference exists:

- do not fabricate a facsimile that could be mistaken for authentic evidence;
- prefer contextual/documentary representation or fail closed according to existing policy.

---

# Evidence and provenance

If a History beat already carries evidence IDs:

- preserve those IDs in semantic prompt metadata;
- use them as provenance anchors;
- do not leak internal citation syntax into image prompts;
- do not render evidence IDs as visible text;
- do not broaden the claim beyond what the evidence-bound beat says.

The semantic preflight is not allowed to "improve" historical claims.

---

# Trusted-script compatibility

If History episode mode is:

```text
trusted_script
```

then:

- canonical narration remains authoritative;
- semantic prompt derivation interprets it visually;
- no live research is triggered;
- no new factual claims are introduced;
- existing frozen metadata may constrain visuals;
- ambiguity fails closed rather than activating research.

Do not alter trusted-script behavior.

---

# Camera/image preflight integration

Both genres already need camera/image preflight.

Preserve:

```text
camera/image preflight
→ persisted
→ cached
→ reused
```

The semantic image-prompt preflight must consume the approved camera/style summary but not overwrite it.

Final prompt assembly should combine:

```text
semantic meaning
+ approved action
+ subject
+ environment
+ factual/genre context
+ composition
+ camera/lens
+ lighting
+ continuity
+ negative constraints
```

For History, also include when available:

```text
era
+ geography
+ approved entities
+ material culture
+ anachronism constraints
```

---

# Final prompt assembly — shared

Create one shared deterministic assembler with genre extension hooks.

Example:

```text
assembleSemanticImagePrompt({
  sharedSemanticBrief,
  visualTreatment,
  cameraPreflight,
  genreAdapterContext
})
```

Do not maintain one unrelated prompt formatter for Veronica and another for History unless provider-specific behavior genuinely requires it.

---

# Critical prompt-projection invariant

Previously, useful fields such as:

- action;
- lighting;
- motion opportunities;

could exist in metadata but not reach the actual image prompt.

For BOTH genres assert that final prompts contain applicable:

- viewer takeaway;
- narrative purpose;
- semantic action;
- subject;
- environment;
- props/objects;
- approved composition;
- approved camera/lens;
- approved lighting;
- genre constraints.

For History additionally assert:

- approved period/era when relevant;
- approved geography when relevant;
- named entity identity when relevant;
- anachronism exclusions when available.

Do not strand important meaning in metadata.

---

# Shared caching

Use a shared cache service with genre-sensitive identity.

Conceptually:

```text
semanticBriefKey =
  genre
  + contentId
  + canonicalSemanticSourceHash
  + visualPlanHash
  + genreVisualDirectionVersion
  + semanticPromptSchemaVersion
  + genreAdapterPromptVersion
  + plannerModelConfigHash
```

For History also include stable hashes of relevant approved context where available:

```text
+ historicalContextHash
+ entityResolutionHash
+ geographyContextHash
+ evidenceSnapshotHash
```

Only include inputs that can change the visual meaning.

---

# Cache must exclude

For both genres exclude:

- locale;
- translated narration text;
- subtitle text;
- TTS voice;
- TTS model/provider;
- audio duration;
- render timing;
- localized title;
- final video resolution;
- image-generation seed.

For History also do not invalidate merely because:

- another localization was added;
- subtitle wording changed;
- voice changed.

---

# History localization reuse

If the History channel supports localized episodes:

```text
canonical History semantic brief: 1
canonical images/maps/diagrams: 1 set
localized EN/DE/IT/FR/PT/etc:
  reuse canonical visual assets
```

The OpenAI semantic-preflight must never run separately for each locale.

Use the existing canonical/source locale defined by the History pipeline.

Do not assume English if the repository defines another canonical source.

---

# Invalidation

SHOULD invalidate when:

- canonical story meaning changes;
- approved semantic beat changes;
- visual treatment changes materially;
- historical context changes materially;
- entity resolution changes for an depicted named figure;
- map/geography context changes for a geography-sensitive asset;
- semantic schema version changes;
- genre adapter prompt version changes;
- explicit refresh requested.

MUST NOT invalidate when:

- only localization changes;
- TTS changes;
- subtitle timing changes;
- render-only metadata changes.

---

# Shared provider configuration

Do not hardcode models in business logic.

Reuse existing OpenAI provider/model configuration.

If genre-specific override is required, support narrowly scoped keys such as:

```text
VERONICA_IMAGE_PROMPT_PLANNER_MODEL
HISTORY_IMAGE_PROMPT_PLANNER_MODEL
```

but prefer an existing generic planning-model configuration plus optional genre override.

Do not tie the text/reasoning planner model to the image-generation model.

---

# OpenAI API usage

Use the repository's existing supported OpenAI interface.

Prefer structured machine-readable output with strict schema enforcement.

Handle:

- valid output;
- refusal;
- incomplete output;
- timeout;
- provider failure;
- schema mismatch.

Fail closed before paid image generation when semantic preflight is required.

Do not depend on provider-side prompt caching for correctness.

Repository persistence is authoritative.

---

# Shared anti-generic validation

Keep a common structural semantic-quality validator.

A brief fails if:

- viewerTakeaway is empty;
- mustShow is empty;
- source beat linkage is missing;
- final prompt becomes pure aesthetic description;
- action is required but absent;
- prompt contradicts approved treatment;
- generated readable text is required;
- image could fit many unrelated stories without modification.

Then add genre-specific checks.

---

# Veronica-specific generic drift

Continue to catch:

- luxury office;
- generic thoughtful consultant;
- unrelated portfolio/material samples;
- restaurant/boutique/gallery drift;
- fashion-editorial scenes unrelated to the narration.

---

# History-specific generic drift

Catch cases such as:

- "dramatic medieval army" with no beat-specific meaning;
- "old parchment map" for a movement/comparison beat;
- "Roman soldiers in battle" for a governance/economic beat;
- "Victorian explorer portrait" for a logistics/environment beat;
- "cinematic ancient city" with no specific relation to narration.

A historically styled scene is not sufficient.

---

# History anachronism validator

Add a bounded validator based only on approved context.

It should be able to flag obvious prompt contradictions such as:

```text
approved year: 1812
prompt requests motor vehicles
```

or:

```text
approved medieval setting
prompt requests electrical lighting
```

Do not build an encyclopedic historical inference engine.

Use:

- explicit approved prohibited details;
- existing era/material-culture metadata;
- deterministic constraints already present in the History planner.

If the system lacks enough metadata, do not fabricate rules.

---

# Example History regression fixtures

Use existing History fixture episodes rather than inventing new stories.

Pick at least three different semantic modes from existing tests/packs:

1. a Napoleon 1812 beat;
2. a Black Death or Rome beat;
3. a Franklin Expedition or another expedition/logistics beat.

Prefer fixtures already in the repository.

Tests must verify semantic alignment, not exact prose.

---

# Example regression — Napoleon 1812

Use an existing approved beat if available.

Example semantic requirement:

```text
narration beat: supply/logistics collapse during retreat
```

The semantic brief should prioritize:

- collapsing logistics;
- abandoned/broken supply system;
- retreat;
- winter conditions only if approved;
- period-correct actors/materials.

It should reject a generic heroic battle image.

Do not hardcode unsupported details into the production implementation.

---

# Example regression — Black Death

Use an existing approved beat.

If the beat concerns:

```text
policy response / quarantine / social consequence
```

the image semantics should show the specific institutional or social response, not simply:

```text
generic plague doctor in fog
```

unless a plague doctor is actually supported and relevant to the period/beat.

---

# Example regression — Franklin Expedition

If the beat concerns:

```text
ship trapped / supply failure / environmental isolation
```

the image should communicate that relation.

It must not collapse into:

```text
generic Victorian explorer portrait
```

or unrelated polar landscape.

---

# Existing History maps/diagrams regression

Re-run affected History map/diagram tests.

The semantic preflight must not regress:

- movement;
- spatial comparison;
- spatial area;
- event location;
- causal diagrams;
- dependency diagrams;
- process;
- temporal sequence;
- policy response;
- evidence set;
- hard semantic invariants.

No map/diagram topology should be rewritten by the semantic prompt layer.

---

# Historical figure reference regression

Use an existing named-figure fixture such as Napoleon only if already present.

Test:

```text
asset depicts named figure
+ approved reference available
→ reference remains eligible for generation
```

and:

```text
asset does not depict named figure
→ semantic preflight does not cause reference attachment
```

The new subsystem must not cause all history prompts to receive historical reference images.

---

# CLI

Integrate with existing CLI conventions.

Support semantic derivation/inspection for both genres.

Conceptually:

```bash
... veronica visuals derive-image-prompts --content-id L01-S01
... history visuals derive-image-prompts --episode <id>
```

and inspection:

```bash
... veronica visuals inspect-image-prompts --content-id L01-S01
... history visuals inspect-image-prompts --episode <id>
```

Do not invent these exact command names if the repository has established alternatives.

Use the existing command hierarchy.

---

# Refresh

Support targeted refresh:

```text
refresh semantic image-prompt brief
```

without forcing:

- narration regeneration;
- research regeneration;
- visual-plan regeneration;
- map regeneration;
- TTS regeneration;
- localization regeneration.

For History, refreshing semantic prompt briefs must not refresh frozen research.

---

# Feature capability

Represent this as a shared capability with genre configuration.

Conceptually:

```ts
semanticImagePromptPreflight: {
  enabled: true,
  provider: "openai",
  cache: true,
  failClosed: true,
  adapter: "veronicaBenini" | "history"
}
```

Do not enable automatically for unrelated genres in this task.

---

# Offline tests

All automated tests must run without live OpenAI calls.

Mock through existing provider seams.

At minimum test:

## Shared

- strict schema;
- cache hit/miss;
- locale independence;
- canonical invalidation;
- visual-plan invalidation;
- deterministic final prompt assembly;
- provider failure;
- malformed response;
- generic drift;
- action/camera/lighting projection.

## Veronica

- L01-S01 five semantic meanings;
- multilingual reuse;
- existing hook diversity remains unchanged.

## History

- historical semantic grounding;
- no invented facts;
- entity preservation;
- era/geography projection;
- map semantics preserved;
- diagram semantics preserved;
- historical-reference gating preserved;
- trusted-script mode triggers no research.

---

# Shared one-call test

For one content ID / episode:

```text
cold cache:
canonical request → 1 OpenAI call

localized render requests:
→ 0 additional semantic calls
```

Verify for Veronica.

Verify for localized History if localization exists.

---

# History no-research regression

This is mandatory.

A semantic prompt derivation in History must produce:

```text
research calls = 0
claim-extraction calls = 0
web calls = 0
image-generation calls = 0
```

for offline/fixture execution.

The semantic OpenAI call itself is the only allowed live provider action when explicitly enabled.

---

# History source mismatch

Fail closed when:

- visual asset references an unknown entity;
- geography-sensitive asset uses unknown/unapproved place;
- requested historical detail conflicts with approved context;
- asset beat cannot be mapped to canonical narration;
- semantic response introduces unsupported named entities;
- semantic response changes event outcome/relationship.

Prefer typed findings.

---

# Suggested finding codes

Shared:

```text
SEMANTIC_IMAGE_BRIEF_MISSING
SEMANTIC_IMAGE_BRIEF_SCHEMA_INVALID
SEMANTIC_IMAGE_BRIEF_ASSET_MISMATCH
SEMANTIC_IMAGE_BRIEF_TEXT_IN_IMAGE
SEMANTIC_IMAGE_BRIEF_GENERIC_DRIFT
SEMANTIC_IMAGE_BRIEF_MISSING_ACTION
SEMANTIC_IMAGE_BRIEF_SOURCE_MISMATCH
SEMANTIC_IMAGE_BRIEF_PROVIDER_ERROR
```

History-specific:

```text
HISTORY_SEMANTIC_PROMPT_UNSUPPORTED_ENTITY
HISTORY_SEMANTIC_PROMPT_UNSUPPORTED_PLACE
HISTORY_SEMANTIC_PROMPT_CHRONOLOGY_CONFLICT
HISTORY_SEMANTIC_PROMPT_ANACHRONISM
HISTORY_SEMANTIC_PROMPT_MAP_MUTATION
HISTORY_SEMANTIC_PROMPT_DIAGRAM_MUTATION
HISTORY_SEMANTIC_PROMPT_EVIDENCE_BROADENING
```

Use existing naming conventions if present.

---

# Review packs

Extend both genre review/approval artifacts.

## Veronica

Expose:

- content thesis;
- semantic brief hash/cache;
- per-asset viewer takeaway;
- mustShow;
- action;
- relevance anchors;
- final prompt preview;
- drift findings.

## History

Expose all above plus, when relevant:

- canonical period/era;
- geography anchors;
- entity anchors;
- reference-image eligibility;
- evidence/provenance IDs;
- anachronism findings;
- map/diagram preservation status.

Do not expose secrets.

---

# History review metrics

Add bounded metrics such as:

```text
episodesWithSemanticBrief
assetsWithSemanticBrief
assetsWithViewerTakeaway
assetsWithNarrativeAction
assetsWithEraConstraintWhereRequired
assetsWithGeographyConstraintWhereRequired
namedFigureIdentityMismatches
unsupportedEntityFindings
unsupportedPlaceFindings
anachronismFindings
genericHistoricalDriftFindings
mapMutationFindings
diagramMutationFindings
promptAssemblyFailures
```

Target zero for failure metrics in valid fixtures.

---

# Image identity

For both genres, image cache identity should reflect final prompt meaning.

Conceptually:

```text
imageAssetKey =
  assetId
  + finalPromptHash
  + imageModelConfigHash
  + referenceImageHashIfAny
```

Locale remains excluded.

For History, include relevant existing provider/reference identity as currently required.

Do not replace existing artifact identity rules if they are stronger.

---

# Existing images

Do not delete existing generated images.

When final semantic prompt hash changes, mark stale through existing invalidation mechanisms.

Conceptually:

```text
STALE_BY_SEMANTIC_PROMPT
```

Do not regenerate images during this task.

---

# Live smoke tests

Only if repository provider policy explicitly allows live OpenAI text calls.

No image generation.

Run at most:

1. Veronica `L01-S01`;
2. one History fixture/episode.

For History verify:

- correct story beat;
- correct historical actors/context;
- no invented detail;
- no generic historical drift;
- map/diagram/reference rules preserved.

If live providers are disabled, skip and report exact commands.

Do not modify provider policy merely to execute smoke tests.

---

# Token/cost discipline

Keep calls bounded.

Do not send:

- full episode packs;
- all languages;
- unrelated evidence;
- all 40 History episodes in one request.

For History, include only evidence/context required for the content ID being planned.

Cache all successful semantic briefs.

Do not repeatedly call OpenAI on regeneration.

---

# Parallel execution safety

Safe parallel discovery:

- agent A: shared OpenAI/cache architecture;
- agent B: Veronica adapter/regressions;
- agent C: History adapter/source contracts;
- agent D: History review-pack/test fixtures.

Single writer for:

- shared semantic schema;
- shared cache identity;
- shared prompt assembler;
- capability registry.

Avoid overlapping edits with ongoing History work.

Inspect git status first.

Do not overwrite unrelated History-channel changes.

---

# Validation policy

Use focused affected-scope validation.

Run:

1. shared semantic schema/service tests;
2. cache/invalidation tests;
3. prompt assembler tests;
4. Veronica regression tests;
5. History semantic regression tests;
6. History map/diagram invariant tests affected by integration;
7. historical-reference gating tests;
8. CLI tests;
9. review-pack validation;
10. affected package typecheck;
11. targeted ESLint.

Do not run the full repository suite unless directly required.

Do not run expensive full History corpus generation as a default validation.

---

# Risk-based rollout

Do not immediately derive semantic briefs for all History episodes.

After implementation:

## Gate 1

Use offline fixtures.

## Gate 2

Optional live semantic-only smoke test:

- one Veronica Short;
- one History episode.

## Gate 3

Produce prompt-preview review artifact.

## Gate 4

Only after human approval should the pipeline derive briefs for the full History corpus and later regenerate images.

No paid image generation in this task.

---

# Backwards compatibility

If semantic preflight is disabled for a genre:

- preserve current behavior.

For genres where it is enabled and fail-closed:

```text
missing semantic brief
→ derive/cache it
→ if derivation fails, stop before paid image generation
```

Do not silently fall back to generic prompts for History or Veronica when their semantic preflight capability is enabled.

An explicit developer-only compatibility override may exist if required by current architecture, but it must be opt-in and visible in reports.

---

# Documentation

Document concisely:

- shared semantic preflight architecture;
- genre adapters;
- Veronica rules;
- History factual-grounding rules;
- cache/invalidation behavior;
- locale reuse;
- History trusted-script behavior;
- map/diagram preservation;
- historical-reference behavior;
- refresh command;
- inspection command;
- optional live smoke tests.

Avoid large architecture prose.

---

# Acceptance criteria — shared

Complete only when:

- [ ] semantic image-prompt preflight is a shared capability;
- [ ] Veronica and History both use it through adapters;
- [ ] no duplicated OpenAI semantic-preflight implementation exists;
- [ ] strict structured output is validated;
- [ ] cache is persistent;
- [ ] locale is excluded from cache identity;
- [ ] cache hits perform zero new semantic calls;
- [ ] final prompt assembly is deterministic;
- [ ] action/camera/composition/lighting reach actual prompts;
- [ ] generic visual drift is detected;
- [ ] image generation is not executed.

---

# Acceptance criteria — Veronica

- [ ] L01-S01 semantics still resolve to the five correct meanings;
- [ ] EN/DE/IT/FR/PT reuse one canonical brief/image set;
- [ ] hook duplicate rate does not regress;
- [ ] long-form similarity does not regress;
- [ ] unrelated editorial/luxury drift is blocked.

---

# Acceptance criteria — History

- [ ] History semantic preflight consumes canonical approved story context;
- [ ] trusted-script mode remains unchanged;
- [ ] no live research is triggered;
- [ ] no unsupported named entity is introduced;
- [ ] no unsupported place is introduced;
- [ ] chronology is preserved;
- [ ] era/material constraints are projected where available;
- [ ] approved geography is preserved;
- [ ] map geometry is never invented/mutated;
- [ ] diagram topology/semantics are never invented/mutated;
- [ ] historical figure identity is preserved;
- [ ] reference images remain attached only when relevant;
- [ ] evidence scope is not broadened;
- [ ] generic historical imagery is rejected when a beat requires specificity;
- [ ] localization reuses canonical visuals;
- [ ] affected History tests pass.

---

# Final response

Return only:

1. `VERDICT: APPROVE_FOR_DUAL_GENRE_PROMPT_REVIEW` or `BLOCKED`
2. shared files changed;
3. Veronica-specific files changed;
4. History-specific files changed;
5. shared semantic schema/version;
6. genre adapter versions;
7. cache-key inputs;
8. expected cold-cache call count per content ID;
9. locale-reuse status for both genres;
10. Veronica L01-S01 regression result;
11. History semantic fixture results;
12. History trusted-script/no-research result;
13. History map/diagram preservation result;
14. historical-reference gating result;
15. generic-drift validation result by genre;
16. tests/typecheck/lint status;
17. live smoke-test status;
18. review/debug artifact paths;
19. exact commands for human inspection of one Veronica and one History semantic prompt set;
20. blockers, if any.

Do not generate images.

Stop after semantic prompt derivation and prompt-preview validation.
