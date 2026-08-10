# Cursor Prompt — Add OpenAI Semantic Image-Prompt Preflight to `veronicaBenini`

## Role

Act as a senior multimodal YouTube production-pipeline engineer and visual director.

Implement a **semantic image-prompt preflight** for the existing `veronicaBenini` genre pipeline.

The purpose is to fix a verified quality problem:

> generated images can be visually polished yet weakly related to the narration.

The new step must use an OpenAI text/reasoning call to interpret the canonical story and visual beats **before image generation**, producing a structured, cached semantic prompt package that makes every generated image clearly explain the narration.

Do not redesign the approved visual planner.

Do not generate paid images in this task.

---

# Primary outcome

For each canonical `contentId`, derive one language-neutral semantic image-prompt package:

```text
canonical story + approved visual plan
        ↓
OpenAI semantic image-prompt preflight
        ↓
cached CanonicalImagePromptBrief
        ↓
deterministic final prompt assembly per asset
        ↓
existing image generator
```

The OpenAI preflight runs **once per content ID when needed**, not once per locale and not once per image.

The same resulting image assets remain reusable for:

- English
- German
- Italian
- French
- Portuguese

---

# Why this change is needed

The existing approved visual plan can still produce prompts that over-index on:

- premium editorial mood;
- luxury interiors;
- elegant professionals;
- tactile objects;
- generic “thoughtful person” imagery;
- visually attractive but semantically ambiguous scenes.

The first Short exposed the issue clearly.

Narrative meaning:

```text
You can be better than your competition and still lose the client.
Customers cannot directly see expertise.
They judge visible signals.
Being an expert and being perceived as an expert are different.
Real work creates competence.
Positioning makes that competence visible.
```

Generated images instead drifted into:

- unexplained sample books;
- restaurant/interior scenes;
- abstract material-selection scenes;
- fashion/editorial environments;
- people examining objects without a clear relation to the narration.

The visual quality was acceptable.

The **semantic relevance was not**.

This task fixes that layer.

---

# Hard scope

Implement only:

1. canonical semantic image-prompt preflight;
2. structured OpenAI output;
3. persistent caching/invalidation;
4. deterministic asset prompt assembly;
5. semantic-relevance validation;
6. CLI/debug/review support;
7. affected tests/docs/fixtures.

Do not:

- rewrite narration;
- re-localize scripts;
- change the 24 approved story structures;
- change visual asset counts by default;
- regenerate the visual plans without necessity;
- generate final images;
- generate TTS;
- render videos;
- publish;
- alter history/horror/math genre behavior;
- perform broad OpenAI-client refactors;
- run unrelated repository-wide validation.

Preserve current `veronicaBenini` visual-plan diversity fixes and deterministic behavior.

---

# Existing architecture first

Before editing, inspect:

- existing `veronicaBenini` genre configuration;
- OpenAI client/provider abstraction;
- existing OpenAI planning/reasoning calls;
- image-generation prompt builder;
- camera/image preflight;
- visual-plan schemas;
- asset treatment fields;
- cache/persistence utilities;
- content/source hash utilities;
- provider enable/disable policy;
- CLI visual commands;
- approval/review-pack generation;
- offline fixtures and test helpers.

Reuse existing abstractions wherever practical.

Do not introduce a second OpenAI client if the repository already has one.

Do not hardcode an OpenAI model if the repository already exposes a configurable planning model.

---

# OpenAI API integration

Prefer the repository's current supported OpenAI integration.

If a Responses API client is already available, use it.

Use **Structured Outputs / strict JSON Schema** for the semantic brief rather than parsing free-form prose.

Keep the schema and TypeScript runtime validation in sync.

Handle:

- valid structured response;
- refusal;
- incomplete response;
- provider error;
- timeout;
- schema validation failure.

Do not silently accept malformed output.

---

# Model configuration

Do not hardcode a model name into business logic.

Use the existing OpenAI planning-model configuration if available.

Otherwise introduce a narrowly scoped configuration key such as:

```text
VERONICA_IMAGE_PROMPT_PLANNER_MODEL
```

with a repository-consistent default.

Do not couple the image-prompt planning model to the actual image-generation model.

They are separate responsibilities.

---

# Call granularity

## Required

Use approximately:

```text
1 semantic-preflight OpenAI call per canonical contentId
```

Thus for this series:

```text
24 content IDs
≈ 24 semantic-planning calls on a cold cache
```

NOT:

```text
145 image assets
= 145 planning calls
```

and NOT:

```text
24 content IDs × 5 locales
= 120 planning calls
```

One content-level call should return semantic guidance for every canonical asset in that content ID.

---

# Canonical source

The semantic preflight must be locale-independent.

Use:

1. stable `contentId`;
2. canonical English narration or existing language-neutral semantic source;
3. approved semantic beat plan;
4. approved visual asset plan;
5. format:
   - long 16:9;
   - Short 9:16;
6. genre identity;
7. existing camera/image preflight summary;
8. existing asset narrative purpose / treatment;
9. current image-prompt text if useful as an input to improve rather than blindly replace.

Do not send all five localized narrations to this call.

Do not derive the brief from German/French/etc. separately.

---

# Source minimization

Keep OpenAI request context bounded.

Do not send:

- full review packs;
- all 24 stories at once;
- other episodes;
- unrelated documentation;
- all localized narration files;
- binary images unless a future explicit workflow requires them.

For one content ID send only the information necessary to understand that content's narrative and assets.

---

# Semantic prompt schema

Add a versioned type similar to:

```ts
type CanonicalImagePromptBriefV1 = {
  schemaVersion: 1;

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

  assets: CanonicalAssetSemanticBriefV1[];
};
```

And:

```ts
type CanonicalAssetSemanticBriefV1 = {
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

Adapt naming to existing repository conventions.

Do not duplicate fields already modeled cleanly elsewhere if references are sufficient.

---

# Important ownership rule

The OpenAI semantic preflight owns:

- meaning;
- narrative relationship;
- viewer takeaway;
- must-show details;
- action intent;
- semantic props;
- relevance anchors;
- drift avoidance;
- generation-base-prompt semantics.

The existing deterministic visual preflight remains authoritative for:

- camera/lens;
- aspect ratio;
- continuity identity;
- visual style version;
- lighting policy where already explicitly planned;
- safe areas;
- crop policy;
- image dimensions;
- text-free policy;
- provider-specific image parameters.

Do not let the OpenAI semantic call override approved camera/style architecture arbitrarily.

---

# Final prompt assembly

The image generator must not send only a vague asset prompt.

Create or update a deterministic prompt assembler that combines:

```text
semantic generationBasePrompt
+ viewerTakeaway
+ mustShow
+ actionIntent
+ environmentIntent
+ objectIntent
+ existing subject/continuity description
+ approved composition
+ approved camera/lens
+ approved lighting
+ genre visual style
+ aspect ratio composition requirements
+ text-free requirement
+ negative/drift constraints
```

The resulting final prompt should describe:

- WHAT must happen;
- WHY the viewer needs to understand it;
- WHO/WHAT is visible;
- WHAT the subjects are doing;
- WHERE it happens;
- HOW it is composed;
- HOW it is photographed;
- WHAT must not appear.

---

# Fix the previously observed prompt omission

Human review found that useful structured fields such as:

- `action`;
- `lighting`;
- `motionOpportunities`;

may exist in the plan but were not always projected into the actual image prompt.

Fix this now.

At minimum the actual image-generation prompt must include applicable:

- semantic action;
- camera;
- composition;
- lighting;
- subject;
- environment;
- props;
- narrative purpose;
- text-free constraint.

Do not leave critical semantics stranded only in metadata.

---

# Semantic relevance principle

A generated-image prompt must pass this question:

> If the narration audio were muted, would this image still visually express the beat rather than merely match the genre mood?

A beautiful but semantically loose image is a failure.

Prioritize:

1. narration relevance;
2. immediate conceptual clarity;
3. mobile readability;
4. believable human/business behavior;
5. visual storytelling;
6. genre aesthetics.

Aesthetic polish must not outrank relevance.

---

# Genre-specific anti-drift rules

For this positioning/business series, include stable anti-drift guidance such as:

```text
Avoid generic luxury/editorial imagery that does not explain the narration.
Avoid unexplained sample books, fabric/material boards, restaurants,
boutiques, galleries, prestige offices, or contemplative portraits unless
the narration beat specifically requires them.

Do not use “professional looking thoughtful” as a substitute for a
business concept.

Prefer visible decisions, comparisons, evidence, recognition,
misrecognition, customer choice, communication signals, transformation,
and cause/effect relationships.
```

Keep these rules genre-level and static so they can be shared across requests.

---

# Example target behavior — L01-S01

Use this exact content ID as a regression fixture.

The semantic preflight should derive approximately these five visual beats.

Do not hardcode the wording into production logic; encode it as a fixture/expected semantics.

## Asset 1 — hook

Narration:

```text
You can be better than your competition and still lose the client.
```

Desired semantic concept:

```text
A client visibly choosing the professionally clearer option
while another credible, potentially more skilled professional loses.
```

Viewer takeaway:

```text
Better skill does not guarantee the client decision.
```

Do NOT produce:

```text
woman looking at a portfolio;
luxury interior;
unexplained material samples.
```

---

## Asset 2 — invisible expertise

Narration meaning:

```text
Customers cannot directly see expertise.
```

Desired semantic concept:

```text
Deep competence exists but is not directly visible to the buyer;
the buyer can only judge external evidence/signals.
```

Viewer takeaway:

```text
Skill itself is hidden.
```

Use a visual comparison or interaction, not a vague introspective portrait.

---

## Asset 3 — visible signals

Narration meaning:

```text
They see your offer, content, website, reputation and what others say.
```

Desired semantic concept:

```text
A buyer evaluating recognizable, visually clear evidence signals around
one professional: offer, portfolio/content, website/interface structure,
recommendation/social proof cues.
```

No readable generated text.

Use graphical/physical cues rather than fake legible UI copy.

---

## Asset 4 — expertise vs perceived expertise

Narration meaning:

```text
Being an expert and being perceived as an expert are different.
```

Desired semantic concept:

```text
A clear visual contrast between strong hidden competence and a professional
whose competence is much easier for the market to recognize.
```

The comparison must be understandable quickly.

---

## Asset 5 — payoff

Narration meaning:

```text
Positioning makes real competence visible and gives people a clear reason to choose you.
```

Desired semantic concept:

```text
A credible expert whose specialization and evidence are now coherent,
easy to understand, and clearly selected by the client.
```

Viewer takeaway:

```text
Positioning does not invent expertise; it makes real expertise legible.
```

---

# Final prompt quality lint

Add a deterministic semantic prompt quality check.

A prompt should fail/refine if:

- `viewerTakeaway` is missing;
- `mustShow` is empty;
- no valid beat/source anchor exists;
- action intent is absent for a human decision/action scene;
- the final prompt loses all narrative-specific anchors;
- it requests readable image text;
- it contradicts the approved visual-plan treatment;
- it relies only on aesthetic language;
- it becomes generic enough to fit unrelated business videos.

Do not try to solve semantic quality solely with keyword-count heuristics.

Use structural fields as the main gate.

---

# Generic-prompt detector

Add a narrow warning—not necessarily a blocker—for prompts dominated by generic visual language.

Examples of suspicious prompts:

```text
cinematic professional woman in luxury office
premium editorial portrait
thoughtful businesswoman at desk
stylish consultant reviewing materials
moody modern workspace
```

If a prompt contains these aesthetics but lacks strong `mustShow`,
`viewerTakeaway`, `actionIntent`, and story-specific relevance anchors,
flag it as `GENERIC_VISUAL_DRIFT`.

---

# Cache

Persist the semantic brief.

Use an existing repository cache abstraction if possible.

Suggested logical cache identity:

```text
imagePromptBriefKey =
  contentId
  + canonicalSemanticSourceHash
  + visualPlanHash
  + genreVisualDirectionVersion
  + semanticPromptSchemaVersion
  + plannerPromptVersion
  + plannerModelConfigHash
```

Do NOT include:

- locale;
- localized narration hash;
- localized title;
- subtitle text;
- TTS voice;
- TTS duration;
- render timing;
- image-generation seed.

---

# Invalidation

Invalidate only when relevant semantic/visual inputs change.

Examples that SHOULD invalidate:

- canonical story meaning changes;
- semantic beats change;
- approved visual treatment changes;
- asset IDs/beat mapping changes;
- semantic prompt schema changes;
- planner prompt version changes;
- genre visual-direction version changes;
- planner model configuration changes if repository policy treats model output as version-sensitive;
- explicit refresh/force.

Examples that MUST NOT invalidate:

- DE/IT/FR/PT narration changes that preserve canonical meaning;
- localized titles;
- subtitles;
- TTS provider;
- voice;
- audio duration;
- FFmpeg timing;
- output language;
- localized overlay copy.

---

# Local cache vs OpenAI prompt caching

The persistent repository cache is the authoritative mechanism preventing repeated planning calls.

If the existing OpenAI client supports OpenAI prompt caching controls cleanly:

- keep static genre/system instructions at the beginning;
- put content-specific data later;
- optionally use a stable prompt cache key for this planner family.

Do not make correctness depend on provider-side prompt caching.

A repository cache hit should skip the OpenAI semantic-preflight call entirely.

---

# Cache observability

Record:

```ts
{
  cacheStatus: "hit" | "miss" | "refresh";
  cacheKey: string;
  sourceSemanticHash: string;
  visualPlanHash: string;
  plannerPromptVersion: string;
  plannerModel: string;
  createdAt: string;
}
```

Do not log API secrets.

---

# One-call structured prompt

Use one bounded request per content ID.

Conceptually the system/developer instructions should tell the model:

```text
You are a visual-storytelling director.

Convert the supplied canonical narration and approved visual plan into
semantically precise image-generation guidance.

Every asset must visually explain its narration beat in under one second.

Do not invent language-specific text.
Do not replace meaning with generic editorial mood.
Do not change asset IDs or beat order.
Do not change approved camera/style constraints.
Return only the strict schema.
```

Content-specific data should include:

- content ID;
- title;
- format/aspect ratio;
- canonical narration;
- semantic beat list;
- asset list;
- current treatment summaries;
- anti-drift rules;
- approved preflight summary.

---

# Structured output validation

Validate all returned asset IDs.

The response must:

- contain every expected asset exactly once;
- contain no unknown assets;
- preserve beat linkage;
- use the correct content ID;
- contain no language-specific image text;
- contain non-empty semantic fields;
- fit the schema.

Fail closed on mismatch.

Do not silently drop assets.

---

# Retry policy

Keep retries bounded.

For a schema/relevance validation failure:

1. one normal retry with concise validation feedback;
2. optionally one final repair retry if existing provider policy permits;
3. otherwise fail the semantic preflight for that content ID.

Do not enter unbounded agent/model loops.

Reuse repository retry/backoff utilities if available.

---

# Provider failure behavior

For `veronicaBenini` when semantic preflight is enabled:

Default behavior should be:

```text
missing/invalid semantic image brief
→ stop before paid image generation
```

Do not silently fall back to the old generic prompt path.

If backwards compatibility requires a fallback, it must be:

- explicit;
- opt-in;
- clearly reported;
- disabled for this positioning content pack.

Example:

```text
--allow-legacy-image-prompt-fallback
```

Do not enable it by default.

---

# Feature/configuration

Introduce a narrowly scoped genre capability/config if needed:

```ts
semanticImagePromptPreflight: {
  enabled: true,
  provider: "openai",
  cache: true,
  failClosed: true
}
```

Prefer existing capability registry patterns.

Do not affect other genres unless they explicitly enable it.

---

# CLI

Integrate with the normal image-generation workflow automatically:

```text
image generation requested
        ↓
semantic image brief cache lookup
        ↓
hit → use it
miss → derive once via OpenAI
        ↓
assemble final asset prompts
        ↓
image generation
```

Also provide a debug/planning-only command using existing CLI conventions.

Conceptually:

```bash
... veronica visuals derive-image-prompts \
  --content-id L01-S01 \
  --dry-run
```

and:

```bash
... veronica visuals inspect-image-prompts \
  --content-id L01-S01
```

Use actual repository command naming rather than inventing a parallel CLI hierarchy.

---

# Refresh controls

Support an explicit refresh equivalent to:

```text
--refresh-image-prompt-brief
```

This should invalidate/recompute only the semantic prompt brief.

It should NOT:

- rewrite narration;
- regenerate visual plans unnecessarily;
- regenerate existing images unless image-generation execution is separately requested;
- invalidate localized TTS.

---

# Offline tests

Tests must not require live OpenAI calls.

Add deterministic structured fixtures for:

- L01-S01;
- one long-form episode;
- one diagram-heavy asset if applicable.

Mock the OpenAI provider through the existing test abstraction.

Do not make CI depend on `OPENAI_API_KEY`.

---

# Required regression tests

## 1. One call per content ID

Cold cache:

```text
L01-S01 EN request → 1 OpenAI semantic call
L01-S01 DE request → 0 additional calls
L01-S01 IT request → 0 additional calls
L01-S01 FR request → 0 additional calls
L01-S01 PT request → 0 additional calls
```

Total:

```text
1
```

---

## 2. Locale-independent cache

Changing only locale must preserve the same:

- semantic brief hash;
- asset generation prompts;
- image asset IDs.

---

## 3. TTS independence

Changing:

- voice;
- provider;
- duration;

must not rerun semantic image-prompt planning.

---

## 4. Canonical semantic invalidation

Changing canonical narration meaning must invalidate.

---

## 5. Visual-plan invalidation

Changing approved asset/beat treatment must invalidate.

---

## 6. Schema validation

Missing expected asset => fail.

Unknown asset => fail.

Duplicate asset => fail.

---

## 7. Text-free invariant

If semantic output asks for readable embedded text, fail/refine.

---

## 8. L01-S01 semantic fixture

Verify the five generated semantic briefs correspond to:

1. better expert loses client;
2. expertise is invisible;
3. buyers judge visible signals;
4. real vs perceived expertise;
5. positioning makes real competence visible.

The test does not require exact prose.

It requires the correct semantic relationship and anchors.

---

## 9. Final prompt contains action

For applicable scenes, assert that the final image prompt contains the planned action semantics.

This addresses the previous metadata→prompt omission.

---

## 10. Final prompt contains lighting/camera

Where the approved plan specifies them, assert that final prompt assembly preserves:

- camera/lens;
- lighting;
- composition.

---

## 11. Generic drift

A fixture that returns only:

```text
cinematic professional woman in a premium office
```

without story-specific semantics must fail or emit a blocking semantic-quality finding.

---

## 12. Determinism

Given a cached semantic brief and identical deterministic inputs:

- final generated prompt text must be byte-identical;
- final prompt hash must match.

---

# Review pack

Extend the Veronica visual review pack with a semantic-image-prompt section.

For each content ID expose:

- semantic brief cache status;
- semantic brief hash;
- planner prompt version;
- planner model;
- content thesis;
- asset count;
- for each asset:
  - beat ID;
  - viewer takeaway;
  - mustShow;
  - actionIntent;
  - relevanceAnchors;
  - genericDriftRisks;
  - semantic generationBasePrompt;
  - final assembled image prompt preview;
- semantic quality findings.

Do not expose API secrets.

---

# Human-review report

Add summary metrics:

```text
contentIdsWithSemanticBrief
semanticBriefCacheHitRate
assetsWithViewerTakeaway
assetsWithMustShow
assetsWithActionWhereRequired
genericVisualDriftFindings
textInImageViolations
missingBeatAnchors
promptAssemblyFailures
```

For the current pack target:

```text
contentIdsWithSemanticBrief = 24
genericVisualDriftFindings = 0
textInImageViolations = 0
promptAssemblyFailures = 0
```

when fully derived.

---

# Existing image regeneration

Do not automatically delete existing generated images.

Mark images whose semantic prompt hash changed as:

```text
STALE_BY_SEMANTIC_PROMPT
```

or the repository's equivalent invalidation status.

This allows intentional regeneration without destructive deletion.

The same regenerated canonical image must then serve all five languages.

---

# Image artifact identity

Image-generation identity should include the semantic/final prompt hash so that a materially improved prompt invalidates the old image.

Conceptually:

```text
imageAssetKey =
  assetId
  + finalImagePromptHash
  + imageModelConfigHash
  + referenceImageHashIfAny
```

Locale remains excluded.

---

# Preserve approved visual diversity

Do not let the semantic OpenAI call collapse the recently fixed opening diversity.

The semantic call must not change:

- selected opening grammar;
- viewer-visible hook fingerprint;
- approved composition family;
- approved camera archetype.

It enriches meaning inside the chosen visual treatment.

Re-run the existing diversity gates after integration.

Expected:

```text
hook duplicate rate = 0
max hook-signature frequency = 1
no long-form similarity blocker
```

Do not accept regressions.

---

# Reference images

If the existing pipeline supports reference images:

- preserve current relevance gating;
- do not attach references to every semantic-planning call;
- semantic prompt derivation should describe meaning independent of a reference;
- only image generation should receive a reference when the current pipeline determines it is genuinely relevant.

Do not expand reference-image scope in this task.

---

# Multilingual invariant

The implementation is correct only if this remains true:

```text
L01-S01
  semantic image brief: 1
  canonical generated images: 5
  EN render: reuse 5
  DE render: reuse 5
  IT render: reuse 5
  FR render: reuse 5
  PT render: reuse 5
```

Never generate:

```text
5 images × 5 locales
```

for the same content ID.

---

# Cost/token discipline

Keep the semantic-planning request economical.

Use one request per content ID and output all its asset briefs together.

Do not send repeated static documentation.

If supported by existing OpenAI request helpers:

- arrange stable instructions first;
- dynamic story data last;
- use an appropriate stable prompt cache key.

Repository caching remains the primary cost-control mechanism.

---

# Live smoke test

Tests remain offline.

After implementation, if:

- the repository's paid-provider policy explicitly allows a live call;
- OpenAI credentials are already configured;
- the user has not disabled external calls;

run **one semantic-preflight live smoke test for `L01-S01` only**.

Do not generate images.

Inspect the resulting structured brief and final prompt previews.

Verify that the five outputs clearly express:

1. client decision / better expert loses;
2. invisible competence;
3. visible evidence signals;
4. expert vs perceived expert;
5. visible competence / clear selection.

If live providers are not explicitly enabled, skip the live call and report the exact command to run it later.

Do not weaken provider safety/consent configuration merely to run the smoke test.

---

# Validation policy

Run focused affected-scope validation only:

1. semantic schema tests;
2. prompt-derivation service tests;
3. cache/invalidation tests;
4. final prompt assembler tests;
5. `L01-S01` regression;
6. multilingual reuse test;
7. existing hook/diversity regression;
8. existing visual-plan tests affected by integration;
9. CLI tests;
10. affected package typecheck;
11. affected ESLint.

Do not run full repository suites unless required by a directly affected dependency.

---

# Git safety

Before editing:

- inspect `git status`;
- preserve unrelated work;
- assume another session may touch other genres.

Do not:

- reset;
- clean;
- stash;
- revert unrelated changes.

Use repository-native checkpoints if already established.

---

# Suggested implementation shape

Adapt to existing project structure, but a clean separation would resemble:

```text
semantic-image-prompt.types.ts
semantic-image-prompt.schema.ts
semantic-image-prompt.service.ts
semantic-image-prompt-cache.ts
image-prompt-assembler.ts
semantic-image-prompt.validation.ts
```

Do not create all of these if existing files/classes already provide the right seams.

Prefer minimal changes.

---

# Planner prompt versioning

Version the semantic OpenAI instruction independently, e.g.:

```text
veronica-semantic-image-prompt-v1
```

Changing its instruction text should invalidate the semantic brief cache intentionally.

Store the prompt version with the result.

---

# Failure codes

Prefer typed findings such as:

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

Use existing error/finding conventions.

---

# Documentation

Document concisely:

- why semantic image-prompt preflight exists;
- canonical per-content execution;
- locale-independent cache;
- invalidation rules;
- refresh command;
- fail-closed behavior;
- how to inspect final prompts;
- how to run the optional live `L01-S01` smoke test.

Do not write a large architectural essay.

---

# Acceptance criteria

Complete only when:

- [ ] `veronicaBenini` supports OpenAI semantic image-prompt preflight;
- [ ] one structured OpenAI call derives all asset semantic prompts for one content ID;
- [ ] output uses strict structured validation;
- [ ] cache is persisted;
- [ ] locale is excluded from cache identity;
- [ ] all five locales reuse the same brief and images;
- [ ] cache hit performs zero additional OpenAI calls;
- [ ] canonical semantic changes invalidate correctly;
- [ ] visual-plan changes invalidate correctly;
- [ ] TTS/localization changes do not invalidate;
- [ ] final prompt assembly includes narrative purpose;
- [ ] final prompt assembly includes action where applicable;
- [ ] final prompt assembly includes approved camera/composition/lighting;
- [ ] final prompts remain text-free;
- [ ] generic editorial drift is blocked/flagged;
- [ ] L01-S01 regression captures the five correct visual meanings;
- [ ] existing hook-diversity metrics do not regress;
- [ ] existing long-form similarity gates do not regress;
- [ ] tests run offline without OpenAI credentials;
- [ ] optional live smoke test generates no images;
- [ ] affected typecheck/lint/tests pass;
- [ ] no unrelated genres are changed;
- [ ] no paid images are generated in this implementation task.

---

# Final report

Return only:

1. `VERDICT: APPROVE_FOR_IMAGE_PROMPT_REVIEW` or `BLOCKED`
2. files changed;
3. OpenAI integration reused/added;
4. semantic schema/version;
5. cache-key inputs;
6. cold-cache call count per content ID;
7. locale reuse status;
8. L01-S01 semantic regression status;
9. generic-drift validator status;
10. action/lighting/camera prompt-projection status;
11. existing hook-diversity regression status;
12. tests/typecheck/lint status;
13. live semantic smoke test status;
14. review/debug artifact path;
15. exact next command for human inspection of L01-S01 prompts;
16. blockers, if any.

Do not generate images.

Stop after semantic prompt derivation and prompt-preview validation.
