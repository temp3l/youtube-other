# Veronica Unified Short + Long Visual-Language Implementation Prompt

You are a senior AI visual-systems architect, YouTube creative director,
documentary cinematographer, and senior TypeScript engineer working in an
existing production repository.

Implement a bounded upgrade to the Veronica Benini / strategic-reinvention
visual-planning and image-generation pipeline.

The same core visual concepts MUST apply consistently to BOTH:

1. Veronica Shorts / 9:16 short-form videos
2. Veronica full / long-form / 16:9 videos

Do NOT create two unrelated visual systems.

Shorts and long-form must share one canonical Veronica visual language,
semantic model, visual-family taxonomy, buyer-psychology model, semantic guards,
continuity rules, camera grammar, visual motifs, caching rules, and provider
prompt projection.

Format-specific planners may adapt:

- pacing
- beat density
- scene duration
- chapter hierarchy
- use of establishing shots
- continuity span
- callbacks
- aspect ratio
- visual breathing room

Do NOT broadly refactor unrelated image-generation infrastructure.
Do NOT alter History behavior except where a shared change is strictly necessary
and no-regression is proven.
Do NOT regenerate the complete Veronica catalogue during this task.

---

# 1. Core goal

Transform Veronica image generation from:

> attractive illustrations of business topics

into:

> coherent cinematic visual essays about professional perception,
> buyer psychology, positioning, reputation, recognition, differentiation,
> expertise, trust, memory, recommendation, and market choice.

The visual subject is generally NOT the professional's occupation.

The visual subject is:

> How people perceive, categorize, understand, remember, trust, compare,
> recommend, and choose professionals.

This principle must govern Shorts and full videos.

---

# 2. Canonical Veronica visual genre

Treat the genre as:

> Premium editorial business-psychology documentary imagery.

More precisely:

> Cinematic visual essays focused on observable human decisions,
> professional evidence, perception, memory, differentiation, reputation,
> recognition, market choice, and professional reinvention.

The system should avoid drifting into:

- generic corporate stock photography
- influencer/business-coach imagery
- arbitrary occupations
- surreal AI metaphor
- decorative luxury imagery
- random lifestyle photography
- unrelated craft professions
- visually attractive but semantically empty imagery

The intended visual identity is:

> A premium documentary about why people choose one professional over another.

---

# 3. Calibration failure

Use:

`l01-s03-what-do-people-remember-you-for`

as the primary Short calibration case.

Its prior sequence contained:

1. a person sorting stones into boxes
2. ceramics/material consultation
3. silhouette/candidate-selection imagery
4. an association board
5. fashion consultation

The images were photographically strong but semantically inconsistent.

Failure classes included:

- ABSTRACT_PROP_DRIFT
- OCCUPATION_PROXY_DRIFT
- GENERIC_BUSINESS_STOCK_DRIFT
- SEMANTICALLY_DECORATIVE_SCENE
- weak sequence continuity
- weak buyer-psychology visibility
- disconnected locations
- independent illustration rather than visual storytelling

The same failure classes must also be prevented in long-form videos.

Do not hard-code L01-S03-specific rules.
Fix the reusable Veronica pipeline.

---

# 4. Phase 0 — inspect before editing

Inspect repository truth first.

Identify the smallest existing seams for:

- strategic-reinvention visual planning
- Veronica Short planning
- Veronica long-form planning
- semantic image prompt construction
- shared semantic-image infrastructure
- visual-direction resolution
- scene/beat planning
- provider prompt projection
- visual plan persistence
- prompt persistence
- scene fingerprints
- cache invalidation
- character/reference-image support
- OCCUPATION_PROXY_DRIFT
- diagrams/deterministic visual compilation
- image regeneration CLI/task entry points
- approval/review artifacts
- relevant tests

Likely files may include:

- `packages/shared/src/semantic-image-prompt.ts`
- `packages/strategic-reinvention/src/semantic-image-prompt.ts`
- `packages/strategic-reinvention/src/semantic-image-prompt.unit.test.ts`

Do not assume these are the only relevant files.

Before editing, output a concise implementation plan covering:

1. current architecture
2. reusable seams
3. duplicated Short/long logic
4. safest shared abstraction
5. affected cache/fingerprint boundaries
6. bounded calibration strategy

Do not create a large planning document unless repo conventions require it.

---

# 5. One canonical Veronica visual-language abstraction

Introduce or extend one canonical Veronica visual-language definition.

Conceptually:

```ts
interface VeronicaVisualLanguage {
  version: string;

  genre: string;

  coreSubject:
    | 'buyer-psychology'
    | 'professional-perception'
    | 'market-choice';

  visualFamilies: VeronicaVisualFamily[];

  narrativeFunctions: VeronicaNarrativeFunction[];

  semanticGuards: VeronicaSemanticGuard[];

  literalBeforeMetaphor: true;

  occupationNeutralByDefault: true;

  buyerCentricByDefault: true;

  continuityRules: VeronicaContinuityRules;

  cameraGrammar: VeronicaCameraGrammar;

  tonalRange: VeronicaTonalRange;
}
```

Use repository conventions rather than forcing this exact shape.

Architectural requirement:

> Shorts and long-form must project from the same canonical Veronica
> visual-language configuration.

Do NOT duplicate these rules separately by format.

---

# 6. Shared role model

Make three conceptual roles explicit.

## EXPERT

The professional whose positioning, expertise, reputation, or reinvention
is being discussed.

Possible actions:

- demonstrate competence
- communicate
- publish
- present evidence
- enter or leave an interaction
- become overlooked
- become understood
- become recognized
- become recommended

## BUYER

The person trying to understand or choose.

Possible actions:

- compare
- search
- hesitate
- evaluate
- categorize
- remember
- forget
- recognize
- dismiss
- recommend
- select

## MARKET

The surrounding field of alternatives and signals.

Possible representations:

- competing profiles
- portfolios
- recommendations
- content feeds
- search results
- professional networks
- client conversations
- repeated exposure
- competing offers
- peer comparison

The buyer should frequently be the visual protagonist.

Do not automatically center the Expert in every scene.

---

# 7. Shared visual story bible

Before individual prompts are composed, derive one persisted/cached
visual-story artifact.

Support both formats.

Conceptually:

```ts
interface VeronicaVisualStoryBible {
  version: string;

  format: 'short' | 'long';

  thesis: string;

  viewerTransformation: {
    before: string;
    mechanism: string;
    after: string;
  };

  visualConflict: {
    start: string;
    end: string;
  };

  roles: {
    expert?: CharacterRole;
    buyer?: CharacterRole;
    market?: CharacterRole;
  };

  semanticProgression: string[];

  preferredVisualFamilies: VeronicaVisualFamily[];

  forbiddenDrift: string[];

  continuityStrategy: VeronicaContinuityStrategy;

  visualMotifs?: VeronicaVisualMotif[];

  tonalDirection?: VeronicaTonalDirection;
}
```

For long-form, support chapter/segment visual sub-arcs:

```ts
interface VeronicaLongFormVisualStoryBible
  extends VeronicaVisualStoryBible {
  chapters: Array<{
    chapterId: string;
    thesis: string;
    narrativePurpose: string;
    transformation?: {
      before: string;
      mechanism: string;
      after: string;
    };
    continuityGroup?: string;
    preferredVisualFamilies: VeronicaVisualFamily[];
  }>;
}
```

Prefer extending existing planning types over parallel architecture.

Persist/cache using deterministic semantic fingerprints.

Do not recompute during simple image regeneration if relevant inputs are unchanged.

Invalidate when narration, editorial configuration, visual-language version,
or other semantically relevant inputs change.

---

# 8. `visibleThesis` for every visual beat

Every visual beat in BOTH formats must contain:

```ts
visibleThesis: string;
```

Definition:

> What meaningful idea should the viewer understand from the image if narration
> were muted?

For Shorts:

- optimize for comprehension in roughly 1–3 seconds

For long-form:

- allow somewhat richer compositions
- still require direct semantic intelligibility

Reject/repair vague outputs such as:

- represents expertise
- symbolizes positioning
- illustrates identity
- suggests differentiation
- conveys trust

Prefer observable statements:

- "After the consultant leaves, the buyers cannot explain what she specializes in."
- "The buyer sees many unrelated capabilities but no clear reason to select one."
- "A client compares two professionals and finds usable evidence for only one."
- "When a matching problem appears later, the buyer immediately recalls one specialist."

The visible thesis must not depend on hidden metaphor semantics.

---

# 9. Shared narrative-function model

Use a shared narrative-function taxonomy:

```ts
type VeronicaNarrativeFunction =
  | 'hook'
  | 'setup'
  | 'context'
  | 'conflict'
  | 'evidence'
  | 'contrast'
  | 'mechanism'
  | 'example'
  | 'consequence'
  | 'transition'
  | 'resolution'
  | 'payoff'
  | 'recall';
```

Each beat should capture, where useful:

```ts
viewerQuestion?: string;
newInformation: string;
```

Do NOT independently ask a model for N images.

Derive:

narration
→ argument structure
→ narrative functions
→ semantic beats
→ visual families
→ continuity
→ camera direction
→ provider prompt

---

# 10. Format-specific pacing

The formats share semantics but not identical pacing.

## Shorts

Typical duration:

~45–60 seconds.

Normal semantic beat range:

~6–9 beats.

Do NOT hard-code an exact count.

The first visual should normally establish conflict within ~1–3 seconds.

Prefer rapid information gain.

Typical shape:

HOOK
→ SETUP
→ CONFLICT
→ EXPLANATION
→ CONTRAST
→ MECHANISM
→ CONSEQUENCE
→ PAYOFF

## Long-form

Do NOT scale Shorts linearly.

Do NOT create one image every fixed N seconds.

Plan hierarchically:

episode
→ chapter / argument section
→ narrative arc
→ semantic beats
→ scenes/shots

Long-form may use:

- longer continuity sequences
- recurring characters
- contextual establishing shots
- chapter-level motif progression
- visual callbacks
- diagrams
- evidence sequences
- more breathing room
- revisiting previously established environments

Every scene must still justify its presence.

---

# 11. Hierarchical long-form planning

Introduce or strengthen hierarchical visual planning.

Conceptually:

```ts
interface VeronicaLongFormVisualPlan {
  episodeBible: VeronicaLongFormVisualStoryBible;
  chapters: VeronicaChapterVisualPlan[];
}

interface VeronicaChapterVisualPlan {
  chapterId: string;
  thesis: string;
  narrativeArc: VeronicaNarrativeFunction[];
  continuityGroups: string[];
  beats: VeronicaVisualBeat[];
  callbacks?: string[];
  transitionIntent?: string;
}
```

A long video should not feel like:

> dozens of unrelated AI images.

It should feel like:

> several coherent visual mini-sequences forming one documentary argument.

Prefer reusable locations and recurring characters inside logical arcs.

---

# 12. `VISUAL_INFORMATION_GAIN`

Every beat after the first must answer:

> What does this image communicate that the previous image did not?

Persist this as `newInformation` or equivalent.

If adjacent beats have weak information gain:

1. merge them
2. hold the earlier image longer
3. change the later narrative function
4. use a diagram/evidence insert if it adds real information

Do not generate new imagery merely for:

- same idea, different room
- same person, different pose
- same abstraction, different prop
- same generic meeting, different camera

Apply this to Shorts and long-form.

For long-form, also detect chapter-level repetition.

---

# 13. Literal-before-metaphor hierarchy

For generic Veronica concepts, prefer in this order:

1. observable human cause-and-effect
2. buyer behavior
3. professional evidence
4. social perception
5. direct visual contrast
6. deterministic diagram/editorial graphic
7. controlled conceptual abstraction
8. metaphor

Metaphor is the fallback.

Prefer:

> Buyers discuss a consultant after she leaves and cannot identify what she
> is known for.

over:

> Stones in boxes symbolize mental categories.

Long-form does NOT justify arbitrary metaphor.

---

# 14. `ABSTRACT_PROP_DRIFT`

Introduce or strengthen a Veronica-specific semantic guard.

High-risk symbolic objects include:

- stones
- marbles
- chess pieces
- puzzle pieces
- boxes
- doors
- masks
- strings
- floating objects
- colored cards
- labyrinths
- generic tokens
- unexplained geometric objects

Do NOT globally ban these.

Flag/repair when:

- symbolic meaning is not self-evident
- narration is required to decode it
- a human interaction could express the idea more clearly
- the prop becomes more important than the thesis
- the trope is repeatedly reused

The guard must be semantic, not a brittle keyword blacklist.

---

# 15. Strengthen `OCCUPATION_PROXY_DRIFT`

Generic positioning concepts must not silently become occupation stories.

Examples of unwanted proxy drift:

- expertise → ceramic artist
- differentiation → fashion designer
- evidence → architect material samples
- specialization → chef
- quality → artisan workshop
- creativity → painter
- strategy → chess player

For generic lessons, prefer occupation-neutral contexts:

- consultant
- strategist
- advisor
- independent expert
- agency owner
- knowledge worker
- professional-services specialist
- founder
- subject-matter expert

Neutral environments:

- client meeting
- modern office
- consultation room
- conference environment
- home office
- studio-office hybrid
- neutral presentation setting

Specific occupations remain allowed when the source narration requires them.

Use the same rule for full videos.

---

# 16. `GENERIC_BUSINESS_STOCK_DRIFT`

Flag/repair scenes that collapse to stock imagery:

- people around laptop
- woman staring at screen
- executive looking through window
- group pointing at tablet
- generic boardroom meeting
- man presenting slides
- worried professional at table
- handshake without narrative meaning

These are allowed only when the concrete interaction visibly carries
the scene thesis.

A professional-looking image is not sufficient.

---

# 17. `SEMANTICALLY_DECORATIVE_SCENE`

Detect attractive but unnecessary scenes.

A scene is suspect when:

- deleting it would not change the visual argument
- it merely restates the previous beat
- it is only topically related
- it communicates "business" rather than the proposition
- it exists only because a fixed scene count demands another image

For long-form, allow justified atmospheric/contextual shots only when they have
an explicit purpose:

- chapter transition
- temporal reset
- emotional pacing
- location establishment
- visual callback
- breathing room

Do not misclassify legitimate long-form context shots as decorative.

---

# 18. Shared visual families

Support:

```ts
type VeronicaVisualFamily =
  | 'human-decision'
  | 'professional-evidence'
  | 'social-perception'
  | 'contrast'
  | 'conceptual-editorial'
  | 'diagram'
  | 'environmental-context';
```

## human-decision

A buyer visibly:

- compares
- chooses
- remembers
- recommends
- rejects
- searches
- hesitates
- recognizes

This should be one of the dominant families.

## professional-evidence

Show observable credibility:

- portfolio
- case study
- website
- proposal
- content
- results
- recommendation
- presentation
- proof of work

Do not rely on image-model-generated readable text.

## social-perception

Use for:

- reputation
- memory
- recognition
- referral
- category association
- conversations while the Expert is absent

## contrast

Examples:

- scattered vs coherent
- invisible vs visible
- generic vs specific
- many signals vs one association
- skill vs evidence
- attention vs recognition
- forgotten vs remembered

## conceptual-editorial

Restrained abstraction where direct photography would be weaker.

Keep it a minority mode.

## diagram

Use when structure is better explained graphically.

## environmental-context

Primarily useful in long-form for:

- chapter/location context
- transitions
- professional environment
- breathing room

Do not let it dominate.

---

# 19. Diagrams are first-class

Do not force photography where a diagram communicates better.

Candidate concepts:

- positioning maps
- category hierarchy
- specialization narrowing
- overlap
- audience segmentation
- repeated signals
- differentiation
- memory associations
- perception funnels
- proof systems
- market comparisons
- before/after structures

Prefer deterministic rendering for:

- text
- labels
- charts
- arrows
- UI
- comparisons

Do not ask the image model to generate critical readable text.

---

# 20. Character continuity

When beats belong to one causal narrative, preserve identity.

Support concepts equivalent to:

```ts
continuityGroup?: string;
characterReferenceIds?: string[];
locationReferenceId?: string;
wardrobeContinuity?: string;
```

Persist/reference:

- Expert identity
- Buyer identity
- important secondary characters
- wardrobe
- location
- relevant recurring props

Attach reference images only where relevant.

Short rule:

> continuity within one causal Short is strongly preferred.

Long-form rule:

> continuity should persist across logical chapter arcs and may recur later
> as a callback.

Across the series:

> diversity is desirable.

Within one narrative arc:

> continuity is more important than variety.

---

# 21. Long-form recurring cast

Allow a long episode to use recurring cast patterns.

Example:

- one Expert
- one Buyer
- one or two secondary decision-makers

A chapter may follow the same people through:

meeting
→ confusion
→ comparison
→ evidence
→ later recall
→ decision

This is preferable to replacing every character every few seconds.

Reuse reference images/fingerprints where current provider infrastructure permits.

Do not attach character references to irrelevant scenes.

---

# 22. Semantic camera grammar

Camera direction must support meaning.

Derive it from:

- visible thesis
- narrative function
- psychological state
- visual family
- format

Examples:

## confusion / weak positioning

- wider composition
- competing visual elements
- less obvious hierarchy
- observational framing
- partial obstruction where useful

## comparison / evaluation

- buyer POV
- over-the-shoulder
- balanced alternatives
- alternating focus
- visual competition

## evidence

- controlled detail
- clear hand/object relationship
- readable spatial hierarchy
- buyer interacting with proof

## recognition

- simplified frame
- clean subject separation
- stronger hierarchy
- closer framing
- fewer competing elements

## decisive selection

- clear eye-line
- chosen subject visually dominant
- reduced ambiguity
- confident composition

## long-form context

- wider establishing shots when justified
- contextual inserts
- location continuity
- slower visual reveal where useful

Do not encode one fixed camera recipe.

Reuse existing visual-direction caches where possible.

---

# 23. Aspect-ratio-aware projection

Use the SAME semantic beat and visual thesis as the source for both aspect ratios,
but project composition appropriately.

## 9:16 Shorts

Favor:

- immediate subject legibility
- strong foreground/background separation
- fewer simultaneous narrative elements
- vertical depth
- clear faces/hands/objects
- center-safe compositions
- rapid visual decoding

## 16:9 long-form

Allow:

- richer environment
- layered blocking
- multiple characters
- wider relationship context
- stronger left/right contrast
- medium/wide/detail coverage
- more cinematic spatial storytelling

Do not simply crop one format mechanically when composition would fail.

If a shared base image can safely serve both ratios, reuse it.
Otherwise generate ratio-specific composition from the same semantic beat.

---

# 24. Tonal consistency without monotony

Preserve a premium editorial identity:

- naturalistic lighting
- restrained grading
- documentary credibility
- realistic professional environments
- sophisticated composition
- premium but not luxury-advertising polish

Avoid forcing every frame into:

- black
- beige
- grey
- dark room
- low-key lighting

Allow controlled tonal variation:

- warm daylight
- cool corporate daylight
- bright studio
- evening
- glass/steel
- domestic professional environment
- conference setting
- neutral workspace

Maintain grading coherence rather than identical palettes.

---

# 25. Visual motif library

Support a reusable motif taxonomy.

Examples:

| Concept | Preferred motif |
|---|---|
| perception | glass / reflection / buyer POV |
| choice | alternatives / comparison |
| recognition | immediate eye-line / familiar person |
| evidence | portfolio / observable proof |
| confusion | competing signals |
| specialization | narrowing / reduced options |
| repetition | recurring evidence |
| memory | later recall |
| reputation | conversation while Expert absent |
| category ownership | one clear option among alternatives |
| trust | Buyer interacting with proof |
| recommendation | one person referring another |

These are motifs, not templates.

Prevent motif overuse across adjacent scenes and nearby episodes.

---

# 26. Long-form visual callbacks

Long-form should exploit callbacks.

Example:

Early:

> Buyer cannot explain what the Expert is known for.

Later:

> Same Buyer encounters a relevant business problem.

Final callback:

> Same Buyer immediately recommends the Expert after positioning becomes coherent.

Represent callbacks explicitly where relevant:

```ts
callbackToBeatId?: string;
callbackPurpose?: string;
```

Reuse approved imagery where semantically and visually appropriate.

Do not regenerate an image merely because it appears again.

---

# 27. Shared transformation model

Where appropriate, both formats should express:

BEFORE
→ MECHANISM
→ AFTER

Examples:

- unclear → coherent
- overlooked → recognized
- many signals → one association
- hidden expertise → visible evidence
- generic → specific
- forgotten → remembered
- considered → chosen
- fragmented reputation → category recognition
- random content → repeated positioning signal

Do not produce sequences containing only repeated problem imagery.

The solution/payoff should be visible.

---

# 28. Short hook policy

For Shorts, the first visual should normally contain:

- contradiction
- decision
- tension
- surprising comparison
- consequence
- unresolved question

Avoid slow establishing shots.

The hook must decode quickly.

---

# 29. Long-form opening policy

Full videos should also start with visual conflict.

Do not spend the first 20–30 seconds on generic establishing imagery.

The opening should establish at least one of:

- central positioning problem
- recognizable human consequence
- Buyer decision
- perception gap
- contradiction

After the hook, context may expand.

---

# 30. Long-form chapter rhythm

Each chapter should have a mini-arc.

Possible pattern:

CONTEXT
→ PROBLEM
→ EXAMPLE
→ MECHANISM
→ CONTRAST
→ CONSEQUENCE
→ TAKEAWAY

Do not enforce rigidly.

Avoid many consecutive scenes with the same narrative function.

Use visual-family variation intentionally.

---

# 31. Dynamic scene count

Do NOT hard-code:

- 5 scenes per Short
- 8 scenes per Short
- 16 images per full episode
- one image every N seconds

Derive scene count from:

- narration duration
- semantic beats
- chapter structure
- visual information gain
- scene complexity
- continuity opportunities
- diagram opportunities
- reuse opportunities
- desired pacing

Persist a reason when scene count differs materially from defaults.

---

# 32. Long-form image economics

Before generating a new image, consider:

1. Can an approved frame remain on screen longer?
2. Can crop/pan/zoom provide useful coverage?
3. Can an existing scene return as a callback?
4. Can a deterministic diagram communicate the point better?
5. Can an existing character/location reference preserve continuity?
6. Does the new image add actual information?

Target:

> semantic density per generated asset.

Do not over-reuse to the point of visible repetition fatigue.

---

# 33. Semantic image reuse

Allow reuse when:

- visible thesis is semantically compatible
- scene is an intentional callback
- continuity benefits
- image remains contextually correct
- same person/location is intentionally revisited

Do NOT reuse solely because prompts or embeddings are similar.

Require semantic compatibility.

Do not reuse if it creates:

- chronology problems
- wardrobe contradictions
- wrong Buyer/Expert
- wrong argument stage
- wrong emotional state
- visible repetition fatigue

Persist reuse decisions/fingerprints.

---

# 34. Text/UI policy

Do not depend on image models for readable:

- websites
- headlines
- social posts
- testimonials
- search results
- dashboards
- presentations
- business cards
- profile descriptions
- analytics screens

Generate physical/contextual imagery.

Use deterministic composition for actual text/UI.

This is especially important for multilingual output.

---

# 35. Multilingual visual reuse

Where semantics are equivalent across languages:

- reuse approved base imagery
- regenerate/composite only language-specific overlays
- preserve localized timing independently
- do not regenerate photography solely because narration length differs

If localization changes a semantic beat materially:

- invalidate only that beat
- preserve unaffected assets

---

# 36. Sequence-level QA

Before image-provider calls, evaluate the complete sequence.

Shared checks:

- semantic gaps
- repeated visible theses
- weak information gain
- occupation drift
- abstract-prop drift
- generic stock drift
- decorative scenes
- broken continuity
- missing transformation
- missing payoff
- excessive conceptual metaphor
- visual-family monotony
- repeated locations without purpose
- scene-count inflation
- insufficient visual coverage
- unnecessary new images
- missing Buyer perspective

Long-form additional checks:

- chapter coherence
- cross-chapter repetition
- callback validity
- cast continuity
- motif overuse
- visual fatigue
- chapter transitions
- cumulative story progression

Prefer deterministic checks first.

Use LLM semantic review only where judgment is actually required.

Avoid unnecessary provider calls.

---

# 37. Provider prompt projection

Do NOT send the full internal planning artifact to the image provider.

Project only image-relevant fields:

- visible thesis
- actors
- required action
- environment
- narrative function
- relevant continuity references
- camera direction
- composition
- lighting
- visual family
- prohibited interpretations
- aspect ratio / format requirements

Avoid bloated prompts.

Preserve existing prompt-cache strategy where relevant.

---

# 38. Caching and determinism

Persist/cache unchanged semantic artifacts:

- Veronica visual-language version
- episode/Short story bible
- long-form chapter plans
- beat plan
- narrative functions
- visible theses
- new-information fields
- visual-family selection
- continuity plan
- character references
- camera direction
- semantic image prompts
- diagram plans
- reuse decisions

Use deterministic, versioned fingerprints.

Do not invalidate generated images because irrelevant metadata changed.

Invalidate only when semantically relevant inputs change.

Do not repeat visual-direction OpenAI calls during simple image regeneration
if inputs are unchanged.

---

# 39. Short calibration — L01-S03

After implementation, regenerate ONLY affected planning artifacts and images for:

`l01-s03-what-do-people-remember-you-for`

Use current approved narration.

Target progression:

1. hook: what will people remember?
2. professional interaction/exposure
3. Expert leaves / Buyer must recall them
4. unclear or fragmented association
5. contrast with coherent specialist association
6. repeated consistent evidence
7. later Buyer encounters matching problem
8. immediate recall / recommendation / selection

Do not mechanically force eight scenes.

Expected normal range:

~6–9 semantic beats.

Do NOT use:

- arbitrary stone sorting
- ceramics occupation proxy
- fashion occupation proxy
- HR recruitment framing

unless explicitly required by narration.

Desired progression:

UNCLEAR
→ ASSOCIATION FORMATION
→ RECOGNITION
→ RECALL / CHOICE

---

# 40. Long-form calibration

Identify ONE existing Veronica full/long-form episode that is the semantic parent
of L01-S03 or most directly covers the same positioning/perception/recognition
concept.

If repository metadata links a Short to a parent long episode, use that mapping.

Do NOT regenerate the complete long video.

Instead:

1. regenerate/refresh its visual story bible
2. regenerate/refresh chapter visual plans
3. produce semantic prompt previews for representative beats
4. regenerate a MAXIMUM of 3 representative images if provider access and the
   current workflow support bounded regeneration safely

Choose representative beats covering:

- Buyer psychology
- professional evidence
- payoff / recognition

If image generation would trigger broad invalidation or excessive provider cost,
stop at prompt previews and report exact next commands/artifacts.

---

# 41. Short/long consistency regression

Add a regression fixture proving that when a Short and its parent long-form
episode express the same semantic concept, they share:

- genre
- role model
- visual families
- semantic guard behavior
- occupation-neutral policy
- literal-before-metaphor hierarchy
- buyer-centric reasoning
- camera-grammar principles
- continuity rules
- motif taxonomy

They may legitimately differ in:

- beat count
- shot duration
- chapter structure
- contextual depth
- number of characters
- camera pacing
- establishing-shot usage
- callbacks
- aspect ratio

Do NOT force identical prompts.

---

# 42. Focused tests

Add focused tests for at least:

1. shared Veronica visual-language config
2. Short and long-form projection from the same canonical language
3. visible-thesis validation
4. abstract-prop drift
5. occupation-proxy drift
6. generic-business-stock drift
7. decorative-scene detection
8. adjacent information gain
9. dynamic Short beat count
10. hierarchical long-form planning
11. chapter coherence
12. story-bible determinism
13. cache reuse
14. cache invalidation
15. character continuity
16. callback planning
17. before/mechanism/after progression
18. diagram selection
19. multilingual visual reuse
20. semantic image reuse
21. L01-S03 regression
22. linked parent long-form regression
23. History no-regression if shared code changed

Mock paid/provider calls for unit tests.

Avoid expensive integration tests unless standard for the affected seam.

---

# 43. Validation policy

Use risk-based validation.

Run:

- affected unit tests
- affected package typecheck
- targeted lint
- deterministic fixture/regression checks
- relevant History no-regression tests if shared code changed

Do NOT run the full monorepo suite unless:

- affected tests reveal wider impact
- repository policy requires it
- explicit release/final acceptance requires it

Do not regenerate unrelated assets.

---

# 44. Backward compatibility

Preserve existing:

- public APIs where practical
- task-registry behavior
- cache behavior unless deliberately versioned
- History behavior
- non-Veronica genre behavior
- approved/generated assets
- current CLI commands where practical

Prefer additive schema changes.

If persisted schemas change:

- version them
- support old artifacts where practical
- fail clearly when migration is required

---

# 45. Production review — Short calibration

After L01-S03 regeneration, inspect every generated scene.

Rate 1–10 for:

- render quality
- visible-thesis clarity
- narration correspondence
- Buyer-psychology clarity
- genre fit
- continuity
- information gain

Rate the sequence for:

- hook strength
- narrative progression
- semantic comprehension without narration
- visual coherence
- transformation
- payoff
- YouTube Shorts production readiness

Target overall readiness:

>= 8.5 / 10

Do not approve based on aesthetics alone.

Maximum one bounded remediation/regeneration pass.

---

# 46. Production review — long-form calibration

For the selected long-form calibration episode, evaluate:

- chapter coherence
- Buyer-centric storytelling
- scene-to-scene information gain
- continuity
- visual-family diversity
- semantic clarity
- diagram/photo choice
- motif repetition
- pacing
- callback quality
- production economics
- genre consistency with Shorts
- 16:9 composition quality

Target plan readiness:

>= 8.5 / 10

Do not regenerate the whole episode.

---

# 47. No unbounded remediation

Maximum:

- one Short calibration regeneration pass
- one bounded long-form representative remediation pass

If problems remain:

1. identify the failing semantic guard/planner seam
2. report it
3. stop generating more assets

Do not enter expensive retry loops.

---

# 48. Implementation report

Write a concise report using the existing Codex-run/report convention if present.

Include:

1. VERDICT
2. files changed
3. architecture/seams used
4. canonical Veronica visual-language implementation
5. shared Short/long behavior
6. story-bible implementation
7. long-form hierarchical planning
8. semantic guards
9. Buyer-centric behavior
10. visual families
11. continuity/reference-image behavior
12. camera grammar
13. aspect-ratio projection
14. dynamic scene-count behavior
15. image reuse behavior
16. caching/fingerprints
17. L01-S03 before/after scene count
18. L01-S03 scene summaries and scores
19. selected long-form parent
20. long-form plan/prompt-preview results
21. representative long-form image results, if generated
22. tests/typecheck/lint
23. History no-regression status
24. artifact paths
25. blockers
26. recommended next calibration step

---

# 49. Final response

Return only a concise execution summary:

1. VERDICT
2. shared Veronica visual-language status
3. Shorts integration status
4. long-form integration status
5. semantic guards added/changed
6. continuity implementation
7. caching implementation
8. L01-S03 result
9. long-form calibration result
10. production-readiness scores
11. validation status
12. artifact/report paths
13. blockers
14. recommended next action

If both formats score >= 8.5/10:

Recommend a bounded next calibration batch containing:

- 2 additional Shorts
- 1 additional representative long-form episode plan
- only a few representative long-form images

Do NOT recommend regenerating the complete Veronica catalogue yet.

---

# 50. Core acceptance principle

The implementation is successful only if the same conceptual scene can be
recognized as belonging to the Veronica visual language whether it appears in:

- a 9:16 ~50-second Short
- a 16:9 multi-minute long-form episode

The formats may pace, compose, and structure differently.

They must share the same underlying visual reasoning:

> What is happening in the Buyer's mind, and what observable event allows us
> to show it clearly?
