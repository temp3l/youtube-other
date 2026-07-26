# Codex Prompt: Repair Natural Chalk Rendering and Complete the Grades 5–10 Mathematics Production Pipeline

## Role

Act as a principal TypeScript software architect, Linux rendering engineer, educational media producer, YouTube automation specialist, and experienced mathematics teacher for German secondary education, Grades 5–10.

Work directly in the existing repository. Inspect the actual architecture before changing it. Reuse established abstractions, paths, workflow state, caching, CLI conventions, and publishing integrations. Do not create a second mathematics pipeline or duplicate implementations when the current pipeline can be extended safely.

Implement the work in safe, testable batches, but complete the full scope described below unless a real external dependency blocks execution.

---

## Context and Current Status

A new five-minute German mathematics sample has been reviewed.

The latest sample has these important properties:

- duration: approximately 5:00
- resolution: 1920×1080
- frame rate: 30 fps
- board-only presentation
- narration speed and pacing are now approved
- audio loudness is already appropriate for online educational content
- the current chalk writing still looks artificial
- the current output still contains a small persistent bottom information/subtitle bar
- full-video generation exists
- the previously proposed Grades 5–10 enhancements have not yet been implemented
- Shorts, worksheets, answer keys, quizzes, captions, thumbnails, metadata, curriculum artefacts, and the complete publishing workflow still need to be implemented or verified
- the publishing system still needs private upload, remote verification, per-language approval, scheduling, playlist, caption, and thumbnail integration

Treat the latest narration as the authoritative production baseline.

Do not reintroduce the older faster narration.

---

# Primary Objective

Deliver one production-grade, resumable, idempotent, multilingual mathematics-content workflow for Grades 5–10 that:

1. preserves the currently approved narration speed and voice behaviour;
2. replaces the artificial chalk reveal with convincing stroke-based chalk writing;
3. supports age-appropriate content and rendering from Grade 5 through Grade 10;
4. generates every required lesson artefact;
5. validates mathematical, pedagogical, visual, audio, and publishing quality;
6. uploads videos privately by default;
7. requires explicit approval separately for each language before scheduling or public publication;
8. automatically publishes YouTube-native assets and optionally publishes worksheets and quizzes through a configured external artefact provider.

---

# Non-Negotiable Product Decisions

Treat these requirements as final:

- supported grades: 5, 6, 7, 8, 9, and 10
- full lesson duration target: 4–6 minutes
- canonical curriculum language: German
- initial locales: German, English, Spanish, French, and Portuguese
- board-only presentation
- no teacher avatar
- no animated hand
- no visible writing cursor unless explicitly enabled as a debug option
- current narration speed must remain unchanged
- current approved voice/provider behaviour must remain unchanged unless an external provider forces a documented migration
- information should remain on the board while it is still needed
- one approval is required per language
- stale approvals must be invalidated after relevant artefacts change
- private upload is the default
- public or scheduled publication is fail-closed
- one shared pipeline must serve Grades 5–10
- grade must be a required, typed domain field
- worksheets must contain support, standard, and advanced/transfer exercises
- Shorts must teach a useful micro-concept, not merely advertise the full lesson
- publishing actions must be resumable and idempotent
- existing horror and unrelated repository functionality must not regress

---

# Phase 0: Audit the Existing Repository and Reconstruct the Latest Sample

Before implementation, inspect:

- mathematics packages and entry points
- the isolated educational renderer
- CLI commands
- presentation presets
- narration presets
- scene and board-state schemas
- audio generation and alignment
- current text reveal implementation
- font and formula rendering
- workflow logs and manifests
- output paths
- caching and resume behaviour
- thumbnail generation
- worksheet/PDF support
- quiz support
- caption support
- metadata support
- YouTube publishing support
- approval state
- tests
- duplication or conflicting implementations

Trace how the latest approved sample was produced.

Locate, where available:

- the exact CLI command
- lesson ID
- renderer preset
- audio preset
- TTS provider and model
- voice identifier
- provider speed value
- punctuation/SSML configuration
- generated audio duration
- scene timing manifest
- source script
- workflow run
- effective loudness normalisation
- render profile

Create a concise audit report containing:

- current architecture
- path ownership
- duplicate implementations
- missing functionality
- unsafe assumptions
- current sample provenance
- proposed migration
- implementation batches

Continue into implementation after the audit. Do not stop merely because the repository differs from this prompt.

---

# Phase 1: Lock the Approved Narration Baseline

## Requirement

The current narration speed is correct and must stay exactly as it is.

Do not apply the previous recommendation to slow the narration further.

Create or identify a versioned production audio preset, for example:

```text
math-narration-approved-v1
```

Use repository naming conventions if an equivalent preset already exists.

The locked preset must preserve, as applicable:

- provider
- model
- voice
- provider speed/rate
- sentence segmentation
- punctuation strategy
- SSML/prosody controls
- pause policy
- pronunciation rules
- normalisation
- sample rate
- channel layout
- codec settings

Do not guess new values if the exact current configuration can be recovered from manifests, logs, code, or the latest run.

## Regression protection

Add a representative golden narration fixture.

Validate at least:

- total audio duration remains within a small configured tolerance
- sentence and question pauses remain within tolerance
- the TTS provider speed setting has not changed
- the voice/model identifier has not changed accidentally
- loudness remains within the production target
- no clipping occurs
- language-specific pronunciation rules still apply
- render timing uses actual audio duration and alignment data

Recommended default tolerances:

```yaml
durationTolerancePercent: 3
integratedLoudnessTargetLufs: -16
integratedLoudnessToleranceLufs: 1
truePeakMaximumDbtp: -1.5
```

Do not regenerate approved audio merely because visual rendering changes.

The artefact dependency graph must allow chalk/render changes to invalidate video outputs without invalidating unchanged narration.

---

# Phase 2: Replace the Artificial Chalk Reveal

## Confirmed defect in the current sample

The current renderer appears to reveal completed text glyphs through a horizontal clipping mask.

This causes:

- partially clipped digits and letters during writing
- vertical slices appearing before a complete stroke exists
- characters that look typed and uncovered rather than written
- identical repeated glyphs
- uniform stroke width and opacity
- perfectly stable baselines
- mechanically uniform reveal speed
- headings, formulas, arrows, and lines that feel digitally placed
- insufficient chalk grain and edge breakup

This must not be solved by selecting another handwriting font alone.

The renderer must animate actual writing strokes or a convincing stroke-level equivalent.

## Required rendering architecture

Introduce or refine typed rendering primitives similar to:

```ts
interface ChalkStroke {
  readonly id: string;
  readonly path: VectorPath;
  readonly order: number;
  readonly length: number;
  readonly baseWidth: number;
  readonly colourToken: ChalkColourToken;
  readonly pressureProfile: readonly PressurePoint[];
  readonly speedProfile: readonly SpeedPoint[];
  readonly seed: number;
}

interface ChalkGlyph {
  readonly grapheme: string;
  readonly variant: string;
  readonly advanceWidth: number;
  readonly strokes: readonly ChalkStroke[];
  readonly anchors?: Readonly<Record<string, Point>>;
}

interface ChalkWritingEvent {
  readonly eventId: string;
  readonly sceneId: string;
  readonly startTimeMs: number;
  readonly strokes: readonly ChalkStroke[];
  readonly semanticRole:
    | "heading"
    | "body"
    | "number"
    | "operator"
    | "formula"
    | "annotation"
    | "arrow"
    | "underline"
    | "table"
    | "axis"
    | "geometry";
}
```

Adapt these types to the repository rather than duplicating existing equivalents.

## Stroke-based text

Implement a text-to-stroke layer that:

- splits Unicode text by grapheme cluster
- supports German, English, Spanish, French, and Portuguese diacritics
- supports common Greek letters used in Grades 5–10
- supports digits and common mathematical operators
- supports parentheses, brackets, decimal punctuation, percentage signs, degree signs, roots, powers, indices, and fraction notation
- has deterministic glyph layout
- stores ordered writing strokes
- reveals strokes by path length rather than rectangular clipping
- supports pen/chalk lifts between strokes
- renders rounded, chalk-like line caps
- supports multiple glyph variants for frequently repeated characters

At minimum, provide multiple variants for:

```text
0 1 2 3 4 5 6 7 8 9
a e i n r s t
+ - = × ÷ < > %
( ) [ ]
```

Repeated characters must not look pixel-identical.

Use deterministic seeded selection so rerenders remain reproducible.

## Hybrid fallback for complex mathematics

Do not sacrifice mathematical correctness or legibility merely to fake handwriting.

Use a hybrid strategy:

1. stroke glyphs for ordinary text, numbers, labels, and simple expressions;
2. semantic math layout for fractions, roots, exponents, matrices, equations, and functions;
3. stroke-based rendering for supported formula tokens;
4. a token-level chalk-grain reveal fallback for unsupported complex glyphs;
5. never fall back to the current rectangular whole-line wipe.

For unsupported glyphs, prefer:

- soft localised grain reveal per token;
- short chalk accumulation;
- token-level dissolve constrained to the glyph;
- immediate static placement when clarity is safer.

Do not reveal unsupported formula text using a broad left-to-right clipping rectangle.

## Natural writing timing

Model human-like writing motion without rendering a hand.

Implement:

- stroke-order animation
- speed proportional to path length
- acceleration at the start of simple strokes
- deceleration on curves and corners
- small pauses for chalk lifts
- slightly longer pauses between words or semantic tokens
- slower writing for complex symbols
- faster writing for repeated simple marks
- headings written before their underline
- labels written before arrows that point from them
- equations written in semantic order
- table cells populated in the same order as the explanation
- bounded timing variation driven by a deterministic seed

Avoid:

- one constant character cadence
- identical duration for every glyph
- whole words popping into existence
- writing long content while narration discusses something else
- writing that finishes substantially before its narration cue
- excessive slow writing that delays the lesson

## Chalk material model

Create a deterministic chalk material with:

- subtle stroke-width variation
- pressure-linked opacity
- edge roughness
- fixed grain texture
- small gaps and speckles
- slightly heavier deposits at turns or stroke endings
- low-intensity chalk dust
- subtle colour variation within a semantic colour
- stable texture across frames

The texture must not be generated with a new random pattern every frame.

Per-frame random noise causes flicker and is prohibited.

Cache reusable masks and textures.

## Natural imperfection

Add carefully bounded seeded variation:

- baseline drift
- glyph rotation
- glyph scale
- spacing
- stroke width
- path control points
- underline curvature
- arrow curvature
- line endpoints

Readability and mathematical alignment take priority.

Use role-specific tolerances:

- prose and headings may have more variation
- digits in place-value tables require minimal positional variation
- equality signs and operators must remain aligned
- coordinate axes and geometric constructions must remain mathematically accurate
- grid lines may use a ruler-like chalk mode
- freehand annotations may use stronger imperfection

## Board and eraser texture

Add a subtle static board texture.

Support optional natural erasing with:

- non-uniform eraser coverage
- faint ghost marks
- light smudging
- no excessive dirt
- deterministic output

Do not erase information that remains relevant.

A new conceptual section may use a brief, natural erase transition or a new board region.

## Lines, tables, arrows, graphs, and geometry

Replace perfect digital primitives where appropriate with chalk-aware primitives.

Provide at least:

- freehand chalk line
- ruler chalk line
- underline
- arrow
- brace
- place-value table
- fraction bar
- number line
- coordinate axes
- graph curve
- geometric segment
- angle arc
- circle
- measurement marker

Use a typed precision mode:

```ts
type ChalkPrecisionMode =
  | "freehand"
  | "guided"
  | "ruler"
  | "mathematical";
```

Examples:

- heading underline: `freehand`
- table grid: `ruler`
- coordinate axis: `mathematical`
- explanatory arrow: `guided`
- function graph: `mathematical`

## Acceptance criteria for natural chalk

The renderer is not accepted until:

- no standard text line uses a rectangular clipping reveal
- no partially clipped vertical slices of a glyph are visible
- ordinary text is written stroke by stroke
- repeated digits have visible but bounded variation
- chalk texture is stable and does not flicker
- stroke width and opacity vary naturally
- writing order is semantically correct
- arrows and underlines appear after the object they annotate
- tables and equations remain aligned
- mobile readability remains high
- supported locale diacritics render correctly
- common Grade 5–10 symbols render correctly
- deterministic rerenders produce identical outputs from the same seed
- draft and production renders use the same geometry
- visual-only changes do not force audio regeneration

Create short golden video fixtures demonstrating:

1. prose with accented characters;
2. repeated zeros and arithmetic operators;
3. a place-value table;
4. a fraction;
5. a linear equation;
6. a coordinate graph;
7. a geometry construction;
8. a Grade 9–10 formula.

---

# Phase 3: Improve Board Composition Without Changing the Approved Voice

## Remove the permanent bottom bar

The latest sample still contains a small persistent dark bar at the bottom.

Disable it in the production preset.

Normal subtitles must be generated as separate caption files.

A contextual overlay may appear only for:

- the learning objective
- “Your turn”
- countdown or pause instruction
- important rule
- recap
- accessibility fallback when explicitly configured

The contextual overlay must:

- be large enough for phones
- be temporary
- avoid covering current mathematics
- not repeat every spoken sentence
- be represented as a semantic scene event

Keep the old bar available only as an explicit debug/preview option if it is useful for development.

## Board-state continuity

Implement a board-state planner that:

- retains relevant results
- avoids unnecessary full clears
- allocates regions before writing
- prevents collisions
- supports section transitions
- reflows content when localisation is longer
- detects overflow before rendering
- limits board density by grade band
- keeps the active step visually prominent
- dims or de-emphasises completed work subtly instead of deleting it where appropriate

## Mobile readability

Add automated checks for:

- minimum text size
- minimum stroke thickness
- contrast
- safe margins
- formula density
- collision
- clipped accents
- cropped subscripts/superscripts
- thumbnail-scale legibility
- 9:16 Short legibility

---

# Phase 4: Grades 5–10 as a First-Class Domain

Use one typed pipeline.

```ts
type MathGrade = 5 | 6 | 7 | 8 | 9 | 10;
type MathGradeBand = "foundation" | "intermediate" | "upper-secondary";
```

Suggested mapping:

```ts
const gradeBandByGrade: Record<MathGrade, MathGradeBand> = {
  5: "foundation",
  6: "foundation",
  7: "intermediate",
  8: "intermediate",
  9: "upper-secondary",
  10: "upper-secondary",
};
```

Every artefact must contain:

- lesson ID
- grade
- grade band
- locale
- curriculum framework
- curriculum skill IDs
- schema version
- canonical content hash
- localisation hash where applicable

Grade profiles must control:

- vocabulary complexity
- scaffolding
- board density
- formula density
- exercise difficulty
- prerequisite checks
- notation
- number of steps
- hints
- transfer-task complexity
- worksheet differentiation
- validation rules

Do not hard-code Grade 5 assumptions into shared services.

Support, at minimum:

- natural numbers and place value
- arithmetic
- fractions and decimals
- ratios and percentages
- measurement
- geometry
- algebraic expressions
- equations
- proportional reasoning
- coordinate systems
- linear functions
- statistics
- probability
- Pythagorean theorem
- trigonometric foundations where required
- modelling and graph interpretation

---

# Phase 5: Modular Lesson Model

Target 240–360 seconds for full lessons.

Use a configurable structure:

1. problem-based hook
2. student-facing learning objective
3. prerequisite reminder
4. concept explanation
5. first worked example
6. additional worked examples
7. misconception/error analysis
8. guided learner exercise
9. independent learner exercise
10. visible thinking pause or countdown
11. complete solution
12. transfer question
13. recap/rule
14. next-lesson CTA

Suggested ranges:

```yaml
workedExamples:
  min: 2
  max: 4
guidedExercises:
  min: 1
  max: 2
independentExercises:
  min: 1
  max: 2
commonMistakes:
  min: 1
  max: 2
transferQuestions:
  min: 1
  max: 2
```

Do not solve overlong lessons by increasing the approved voice speed.

Instead:

- remove repetition
- shorten verbose prose
- move optional examples to the worksheet
- split an overlarge topic into linked lessons
- fail with actionable diagnostics

Do not add filler to short lessons.

---

# Phase 6: Generate the Complete Artefact Set

For every lesson and locale, generate or validate:

```text
full video
Short
full-video thumbnail
Short cover/thumbnail metadata where supported
audio
captions in SRT and/or WebVTT
worksheet PDF
answer-key PDF
worksheet structured source data
quiz JSON
quiz answer/explanation data
YouTube title
description
tags
chapters
playlist mapping
curriculum metadata
render manifest
quality report
publishing manifest
workflow state
```

Use existing repository path conventions.

Migrate old paths only when necessary and document the migration.

## Full video

Requirements:

- 16:9
- 4–6 minutes
- approved voice preset
- natural chalk renderer
- production captions
- no permanent bottom bar
- high-quality production encoding
- deterministic manifest
- mathematical and pedagogical validation

## Short

Generate one useful Short per lesson and locale.

Requirements:

- native 9:16 layout
- do not crop the 16:9 render blindly
- approximately 35–60 seconds unless topic requirements justify another configured duration
- one complete micro-concept, challenge, misconception, or worked mini-example
- strong first-second question or visual
- compact resolution
- independent captions and metadata
- same canonical mathematics as the full lesson
- optional CTA to the full lesson
- independent validation

## Thumbnail

Generate one language-specific full-video thumbnail.

Requirements:

- 16:9
- mobile-readable
- minimal text
- one clear mathematical challenge
- consistent channel identity
- safe margins
- deterministic template or prompt provenance
- no misleading equation or answer
- validation against canonical lesson facts

Do not render a full worksheet-like exercise on the thumbnail.

## Worksheet

Generate a structured worksheet source and a rendered PDF.

Include additional exercises not all shown in the video.

Sections:

### Support

- direct application
- scaffolding
- hints where helpful
- reduced cognitive load

### Standard

- expected curriculum difficulty
- independent application
- moderate variation

### Advanced / Transfer

- novel context
- multi-step reasoning
- explanation
- reverse task
- comparison or error analysis
- still appropriate to the selected grade

Requirements:

- accessible typography
- sufficient workspace
- lesson ID
- grade
- skill IDs
- locale
- version
- deterministic exercise IDs
- separate answer key
- programmatic answer verification where feasible
- fail when question and answer disagree

The answer key must be generated automatically but must not be linked publicly by default.

Expose a configuration option:

```yaml
publishing:
  answerKeyVisibility: private
```

Allowed values should include:

```text
private
unlisted-link
public-link
```

## Quiz

Generate a typed quiz containing:

- recall/check
- standard application
- misconception
- transfer

Support suitable types:

```ts
type QuizQuestion =
  | MultipleChoiceQuestion
  | NumericAnswerQuestion
  | TrueFalseQuestion
  | OrderingQuestion
  | ErrorAnalysisQuestion;
```

Each question must include:

- stable ID
- locale
- grade
- skill ID
- prompt
- correct answer
- distractors where applicable
- explanation
- difficulty
- source reference
- validation result

Do not assume YouTube provides native PDF or general quiz hosting.

Publish worksheets and quizzes through a separate configured artefact-distribution provider.

---

# Phase 7: Localisation

German remains canonical.

For `de`, `en`, `es`, `fr`, and `pt`:

- reuse semantic lesson structure
- reuse mathematical facts
- reuse scene and object identities
- generate language-specific narration
- retime scenes from actual localised audio
- reflow board text
- preserve grade level
- localise terminology, number reading, decimal punctuation, units, and contexts
- generate independent captions and metadata
- validate layout per locale
- validate mathematical equivalence
- require independent approval per locale

Do not force identical frame timing across languages.

Do not let localisation silently alter the mathematics or grade level.

---

# Phase 8: Mathematical and Pedagogical Validation

Implement fail-closed validators for:

- missing grade
- missing objective
- missing worked example
- missing misconception
- missing independent task
- missing solution
- missing transfer task
- invalid prerequisite
- unsupported notation
- mathematical inconsistency
- narration/board mismatch
- worksheet/answer mismatch
- quiz/answer mismatch
- grade-inappropriate content
- locale inconsistency
- duration outside 4–6 minutes
- audio preset regression
- excessive board density
- insufficient font size
- collisions
- clipped symbols
- writing before its narration cue
- long empty-board periods
- rectangular text reveal
- unstable/flickering chalk texture
- missing artefacts
- stale approval
- incomplete publishing manifest

Prefer structured semantic checks over keyword allowlists.

Where feasible, use independent symbolic or numeric verification for generated mathematics.

---

# Phase 9: Encoding Quality

The reviewed sample’s video stream is encoded at an unusually low bitrate for a 1080p production master.

Introduce explicit profiles:

```text
draft
review
publish
```

Recommended publish behaviour:

- H.264 or the repository’s established YouTube-compatible codec
- CRF-based quality rather than an extremely low fixed bitrate
- configurable CRF
- appropriate encoder preset
- yuv420p compatibility
- AAC audio at a production-appropriate bitrate
- fast-start metadata where useful
- preserve 30 fps unless a different existing standard is intentional

Suggested starting point, subject to repository benchmarking:

```yaml
publish:
  resolution: 1920x1080
  fps: 30
  videoCodec: libx264
  crf: 18
  preset: slow
  pixelFormat: yuv420p
  audioCodec: aac
  audioBitrate: 192k
```

Provide an optional 1440p publishing profile, but do not make it mandatory on low-resource hosts.

Add quality checks for:

- visible chalk-line breakup after encoding
- text sharpness
- banding
- dropped frames
- A/V sync
- output duration
- corrupt output
- minimum effective video quality

---

# Phase 10: Workflow State, Caching, Resume, and Idempotency

Represent the workflow as a dependency graph.

Track at least:

```text
lesson-plan
script
localisation
audio
alignment
scene-plan
chalk-layout
full-render
short-plan
short-render
thumbnail
worksheet-data
worksheet-pdf
answer-key
quiz
captions
metadata
curriculum-metadata
validation
language-approval
private-upload
thumbnail-upload
caption-upload
playlist-insert
remote-verification
publication-approval
scheduled-publication
external-artefact-publication
```

Each task record must contain:

- task
- status
- start and finish time
- command
- exit code
- error
- input hashes
- output hashes
- cache hit/miss
- retry count
- dependencies
- next recommended tasks

Do not mark a task complete because a file merely exists.

Validate the file and its manifest.

Important invalidation rules:

- chalk renderer change invalidates video and visual reports, not unchanged audio
- script change invalidates audio and downstream outputs
- locale text change invalidates that locale only
- worksheet change does not invalidate video
- thumbnail change does not invalidate video
- changed publishable artefacts invalidate the affected language approval
- changing only private workflow metadata must not force media regeneration

---

# Phase 11: Approval Model

Use separate states for:

1. content/artefact approval;
2. private upload completion;
3. publication approval.

Approval must be per lesson and per locale.

Record:

- approver
- timestamp
- approved artefact hashes
- notes
- approval scope
- invalidation reason

A public or scheduled publish command must fail when:

- the locale is not approved
- hashes differ
- validation is not green
- remote private upload is incomplete
- captions or thumbnail required by policy are missing
- audience setting is unresolved
- external worksheet URL is required but unavailable
- remote verification failed

---

# Phase 12: Complete the Publishing System

## YouTube-native publishing

Implement or extend a typed YouTube publisher supporting:

- OAuth 2.0
- resumable video upload
- private upload by default
- metadata
- default language
- audience setting
- synthetic-media declaration where applicable
- custom thumbnail upload
- caption track upload
- playlist insertion
- scheduled publication
- remote-status polling
- remote verification
- retries with exponential backoff and jitter
- idempotency
- quota-aware execution
- dry run
- channel/locale mapping

Verify current behaviour against official YouTube Data API documentation while implementing.

Do not rely on stale assumptions.

## Required publishing sequence

```text
generate
→ validate
→ approve locale artefacts
→ upload full video privately
→ upload Short privately
→ set metadata
→ set thumbnails where supported
→ upload captions
→ insert into playlists
→ verify remote resources
→ publish external worksheet/quiz artefacts
→ update description links if configured
→ require publication approval
→ schedule or publish
→ verify final status
```

## Scheduling

Scheduling must:

- remain private until the scheduled time
- use the API’s supported publication fields
- validate timestamp and timezone
- store the requested and effective scheduled time
- reject scheduling when approval is stale
- remain idempotent

## Remote verification

After every remote mutation, read back and verify relevant state.

Verify, where applicable:

- remote video ID
- privacy status
- processing status
- title
- description hash or managed block
- locale/default language
- audience setting
- scheduled time
- caption track
- thumbnail completion
- playlist membership

Do not mark upload complete before YouTube processing reaches an acceptable state.

## Idempotency

Persist remote IDs before later steps.

Use a stable idempotency identity derived from:

```text
channel + lessonId + locale + artefactKind + canonicalVersion
```

Before uploading, check workflow state and remote state.

Do not create duplicate videos after a retry or process restart.

## Managed description block

When adding worksheet or quiz links, update only a clearly delimited managed section.

Example:

```text
<!-- BEGIN GENERATED LESSON RESOURCES -->
...
<!-- END GENERATED LESSON RESOURCES -->
```

Preserve manually edited description content outside the managed block.

## Audience classification

Do not infer the YouTube audience setting from grade alone.

Require explicit channel or lesson policy.

Store and publish the configured value.

Fail closed when the setting is required but unresolved.

---

# Phase 13: External Artefact Distribution

YouTube is not the storage system for worksheets, answer-key PDFs, or general quiz JSON.

Create or extend an `ArtefactDistributionProvider` abstraction.

Potential implementations may include an existing repository provider such as:

- Azure Blob Storage
- MinIO/S3-compatible storage
- static-site output
- another already integrated content host

Do not add a new cloud dependency when an existing provider is available.

The provider must support:

- deterministic object keys
- content type
- cache headers
- public/private visibility
- stable URL
- overwrite/version policy
- integrity metadata
- retry
- idempotency
- dry run
- deletion policy
- secure credentials

Default publication policy:

- worksheet: public link
- quiz: public link or configured application endpoint
- answer key: private
- internal reports: private
- manifests: private

If no external distribution provider is configured:

- still generate all files
- mark distribution as pending
- do not insert broken links
- do not block private YouTube upload
- optionally block public publication only when channel policy requires public worksheet links

---

# Phase 14: CLI

Integrate with the current CLI rather than creating a duplicate hierarchy.

Support commands equivalent to:

```bash
youtube math lesson audit <lesson-id>
youtube math lesson generate <lesson-id> --locale de
youtube math lesson generate <lesson-id> --all-locales
youtube math lesson validate <lesson-id> --locale de
youtube math lesson approve <lesson-id> --locale de
youtube math lesson distribute <lesson-id> --locale de
youtube math lesson upload <lesson-id> --locale de --private
youtube math lesson publish <lesson-id> --locale de --schedule "..."
youtube math lesson status <lesson-id>
youtube math lesson next <lesson-id>
youtube math lesson run <lesson-id> --until private-upload
youtube math renderer fixture natural-chalk
```

Adapt names to repository conventions.

Requirements:

- discoverable help
- examples
- JSON output
- human-readable output
- explicit exit codes
- dry run
- resume
- locale selection
- grade selection where applicable
- concurrency limits
- no implicit public publishing
- next-step recommendation

---

# Phase 15: Observability

Add structured logs and metrics for:

- lesson ID
- grade
- locale
- workflow run
- task
- artefact hash
- render preset
- audio preset
- glyph set version
- stroke count
- writing duration
- cache hit/miss
- render duration
- encoding duration
- A/V sync delta
- validation failures
- upload duration
- remote processing state
- retries
- quota response
- approval state
- scheduled time

Do not log:

- OAuth tokens
- API secrets
- private signed URLs
- binary media
- base64 media
- provider credentials

---

# Phase 16: Tests

## Unit tests

Add tests for:

- grapheme segmentation
- accented characters
- glyph variant selection
- deterministic seeds
- stroke ordering
- path-length timing
- pressure and speed profiles
- no per-frame random texture
- math-token fallback
- board layout
- grade profiles
- audio-preset locking
- dependency invalidation
- worksheet differentiation
- answer validation
- quiz validation
- approval invalidation
- publishing state transitions
- idempotency keys
- managed description blocks

## Integration tests

Add tests for:

- text-to-stroke-to-video
- place-value table writing
- algebraic equation writing
- graph and geometry primitives
- current audio reused after visual renderer change
- German canonical lesson localised to another language
- full artefact generation
- Short generation
- worksheet and answer key
- captions
- private upload with mocked provider
- thumbnail and caption attachment
- playlist insertion
- remote verification
- retry/resume
- external artefact distribution
- schedule after approval
- stale approval rejection
- duplicate invocation does not duplicate remote upload

## Visual/golden tests

Provide both frame snapshots and short video fixtures.

Test:

- no rectangular glyph clipping
- no whole-glyph pop-in
- stable grain
- bounded variation
- alignment
- mobile readability
- no persistent bottom bar
- correct scene timing

Do not use snapshots as the sole proof of mathematical correctness.

## End-to-end fixtures

Provide representative fixtures for:

### Grades 5–6

Place value, fractions, or arithmetic.

### Grades 7–8

Equation, percentage, proportional reasoning, or geometry.

### Grades 9–10

Linear function, Pythagorean theorem, trigonometric foundation, statistics, or modelling.

At least one fixture must execute:

```text
plan
→ generate German
→ generate Short
→ generate worksheet
→ generate quiz
→ validate
→ approve German
→ private-upload dry run
→ external-distribution dry run
→ publication dry run
```

---

# Phase 17: Performance

Optimise for Linux and low-resource machines.

Implement:

- cached glyph paths
- cached chalk masks
- cached board textures
- content-addressed scene caching
- static-layer reuse
- no full-video in-memory buffering
- streaming media operations
- configurable concurrency
- interrupted-render resume
- partial scene rerender
- separate draft/review/publish profiles
- deterministic temporary paths
- safe cleanup

Do not make natural chalk dependent on expensive AI video generation.

The renderer should remain deterministic and based on normal Linux rendering tools and existing project technologies.

---

# Phase 18: Backward Compatibility

- preserve the legacy chalk preset
- make the repaired natural-chalk preset the new mathematics default only after acceptance
- do not change horror rendering defaults
- preserve old lesson schemas through migration or compatibility parsing
- version new schemas
- document changed output paths
- do not discard unrelated working-tree changes
- do not use destructive Git operations

Suggested new preset name:

```text
guided-natural-chalk
```

The previous preset may remain available as:

```text
guided-slow-chalk-legacy
```

Use repository naming conventions if better names already exist.

---

# Safe Implementation Batches

Implement in this order:

1. repository audit and latest-sample provenance
2. lock approved narration preset and regression fixture
3. introduce stroke/path domain model
4. implement glyph set and deterministic variants
5. implement natural chalk material
6. implement chalk-aware lines/tables/arrows
7. replace rectangular reveals
8. remove persistent bottom bar
9. add natural-chalk golden fixtures
10. grade-aware domain and validation
11. complete full artefact generation
12. implement Shorts
13. implement worksheets, answer keys, and quizzes
14. complete captions, thumbnails, and metadata
15. implement external artefact distribution
16. repair private YouTube publishing
17. implement remote verification and scheduling
18. complete CLI and workflow state
19. add end-to-end tests
20. run acceptance production fixture
21. update documentation and AI/content pack

After each batch:

- run type checking
- run relevant tests
- run linting
- report changed files
- report unresolved risks
- do not continue from a broken baseline without repairing it

---

# Final Acceptance Criteria

The implementation is accepted only when:

- the latest approved narration behaviour is preserved
- no audio-speed regression occurs
- visual-only changes do not regenerate unchanged audio
- text is no longer revealed through a rectangular line wipe
- ordinary text is written stroke by stroke
- chalk grain is stable
- repeated glyphs vary naturally
- equations and tables remain aligned
- all five locales render required characters
- Grade 5–10 symbols are supported
- the permanent bottom bar is disabled in production
- full lessons remain 4–6 minutes
- the pipeline generates full video, Short, thumbnail, captions, worksheet, answer key, quiz, metadata, curriculum data, reports, and manifests
- worksheets contain support, standard, and transfer sections
- answer keys are validated
- all language approvals are independent
- stale approval is invalidated
- full videos and Shorts upload privately by default
- resumable upload works
- remote IDs persist before subsequent mutations
- retry does not duplicate videos
- captions, thumbnails, and playlists are attached and verified
- scheduling requires valid approval
- worksheets and quizzes can be distributed through a configured provider
- answer keys remain private by default
- existing non-mathematics functionality still passes
- type checking, linting, unit tests, integration tests, and acceptance fixtures pass

---

# Required Final Report

At completion, provide:

1. repository audit
2. latest-sample provenance
3. exact narration settings that were locked
4. explanation of the previous artificial reveal
5. natural chalk architecture
6. glyph and symbol coverage
7. fallback behaviour
8. files changed
9. schema changes
10. CLI changes
11. workflow changes
12. generated artefacts
13. publishing changes
14. external-distribution configuration
15. tests run and results
16. visual fixture locations
17. end-to-end fixture results
18. remaining risks
19. manual credentials or channel setup still required
20. exact commands for:
    - generating one German lesson
    - generating all locales
    - rendering natural-chalk fixtures
    - generating a Short
    - generating worksheet and quiz
    - validating one locale
    - approving one locale
    - private upload
    - publishing external resources
    - scheduling publication
    - checking status
    - resuming after failure

Update the repository’s AI/content pack, architecture summary, or equivalent context export so the completed implementation can be reviewed in a future ChatGPT session.

---

# Engineering Standards

- strict TypeScript
- no unjustified `any`
- runtime validation at I/O boundaries
- explicit domain types
- deterministic rendering
- secure credential handling
- structured errors
- structured logs
- idempotent external operations
- observable workflow state
- mathematical correctness
- pedagogical correctness
- mobile readability
- accessibility
- high-quality encoding
- no silent publication fallback
- no public publication without explicit approval
- no duplicate pipeline
- no brittle keyword-only validators

Begin with the repository audit, then implement the complete scope in safe batches.
