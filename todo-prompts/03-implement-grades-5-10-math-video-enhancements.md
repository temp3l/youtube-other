# Codex Prompt: Implement Mathematics Video Production Enhancements for Grades 5–10

## Role

Act as a principal software architect, educational media production engineer, YouTube automation specialist, and experienced secondary mathematics teacher for German Grades 5–10.

You are working in an existing production repository that already contains:

- a multilingual YouTube content pipeline
- an educational mathematics genre
- an isolated Linux-based `educational-renderer` package
- chalkboard-style rendering presets
- story/audio/video/thumbnail generation workflows
- CLI commands, workflow state, caching, validation, and publishing-related functionality
- German curriculum material and lesson definitions under `docs/mathe`
- existing presets, including a fast-chalk-style preset that has already been tested

Your task is to inspect the current implementation, reuse working abstractions, eliminate duplication, and implement the improvements below as production-grade functionality.

Do not create a second parallel pipeline when the existing architecture can be extended safely.

---

## Primary Objective

Improve the mathematics video pipeline for Grades 5–10 so that it produces high-quality, pedagogically sound, age-appropriate, mobile-readable, multilingual YouTube lessons with:

- a board-only guided chalkboard presentation
- slower, natural narration
- a consistent but modular lesson structure
- 4–6 minute full lessons
- differentiated worksheets
- YouTube Shorts
- thumbnails
- captions
- quizzes
- curriculum metadata
- resumable, idempotent generation
- one approval gate per language
- automatic private upload and optional scheduled publication

The system must remain suitable for unattended batch production, but public publication must remain fail-closed and require explicit approval per language.

---

## Confirmed Product Decisions

Treat the following as final requirements:

1. Full lesson duration: **4–6 minutes**.
2. Supported school grades: **5, 6, 7, 8, 9, and 10**.
3. `grade` is a required, first-class domain field on lesson, curriculum, generation, validation, worksheet, quiz, render, and publishing artefacts.
4. Grade-specific behaviour must be selected through typed grade profiles rather than duplicated pipelines.
5. Default presentation style: **board-only guided slow chalk**.
6. No teacher avatar and no animated hand.
7. Existing board content remains visible while new content is added.
8. Narration in the current sample is too fast.
9. German is the canonical curriculum language.
10. Supported localisation targets initially:
    - German
    - English
    - Spanish
    - French
    - Portuguese
11. Every language requires a separate operator approval before publication.
12. Every lesson uses a consistent instructional structure, but supports additional examples and optional content blocks.
13. Worksheets must include additional differentiated exercises at:
    - easy/support level
    - standard/core level
    - advanced/transfer level
14. Generate all supporting assets where practical:
    - full lesson video
    - YouTube Short
    - thumbnail
    - worksheet PDF
    - answer-key PDF
    - quiz data
    - captions
    - chapter markers
    - metadata
    - curriculum mapping
    - validation report
    - publishing manifest
15. YouTube publishing should be automated as far as safely possible.
16. Upload generated videos privately first.
17. Public or scheduled publication must be blocked until the language-specific approval gate passes.

---

## Required Initial Repository Audit

Before changing code, inspect and document the current implementation.

Identify:

- all educational mathematics packages and entry points
- the `educational-renderer` API and CLI
- all presentation and narration presets
- the current default preset
- lesson schemas and curriculum schemas
- audio generation and timing logic
- render timing and board-state logic
- subtitle/caption generation
- thumbnail generation
- worksheet or PDF generation
- quiz generation
- metadata generation
- YouTube publishing integrations
- workflow state, caching, resume, and retry mechanisms
- existing quality validators
- duplicate implementations or conflicting paths
- current output directory conventions
- where grade/class level is currently represented or inferred
- whether any implementation assumes Grade 5 vocabulary, pacing, layout, examples, or exercise complexity
- topic-specific render primitives required by Grades 5–10, including fractions, algebra, geometry, coordinate systems, functions, statistics, and probability
- relevant tests and missing test coverage

Produce a concise findings summary before implementation, but continue directly into implementation unless a genuine external dependency makes progress impossible.

Do not stop merely because the repository differs from the assumptions in this prompt. Adapt the implementation to the actual architecture and document the differences.

---

## 1. First-Class Grade and Grade-Band Profiles

Introduce a required typed grade model:

```ts
type MathGrade = 5 | 6 | 7 | 8 | 9 | 10;
type MathGradeBand = "foundation" | "intermediate" | "upper-secondary";

const gradeBandByGrade: Record<MathGrade, MathGradeBand> = {
  5: "foundation",
  6: "foundation",
  7: "intermediate",
  8: "intermediate",
  9: "upper-secondary",
  10: "upper-secondary",
};
```

Adapt these names to existing repository conventions, but do not represent grades as unconstrained strings.

Every canonical lesson must carry at least:

```ts
interface MathLessonIdentity {
  lessonId: string;
  grade: MathGrade;
  locale: SupportedLocale;
  curriculumFramework: string;
  curriculumSkillIds: string[];
}
```

Create configurable grade profiles with sensible defaults.

### Foundation: Grades 5–6

Optimise for:

- concrete representations before abstraction
- slower pacing
- shorter explanation units
- more visual scaffolding
- explicit vocabulary introduction
- one transformation or reasoning step at a time
- frequent checks for understanding
- familiar real-world contexts
- strong place-value, arithmetic, fraction, measurement, and basic geometry support

Recommended German narration target: approximately **125–130 WPM**.

### Intermediate: Grades 7–8

Optimise for:

- transition from concrete to symbolic reasoning
- multi-step arithmetic and algebra
- proportional reasoning
- equations, percentages, geometry, data, and probability
- explicit links between representations
- worked examples with gradually reduced scaffolding
- error analysis and explanation tasks

Recommended German narration target: approximately **130–135 WPM**.

### Upper Secondary I: Grades 9–10

Optimise for:

- denser symbolic notation without sacrificing readability
- functions, equations, geometry, trigonometric foundations, statistics, probability, and modelling
- derivations and justified transformations
- multiple solution strategies where pedagogically useful
- proof-like reasoning appropriate to the curriculum
- interpretation of graphs, formulas, domains, assumptions, and units
- examination-style transfer tasks

Recommended German narration target: approximately **130–140 WPM**, with the configured hard maximum remaining **145 WPM**.

### Grade-profile rules

The profile must control or inform:

- narration target and pause policy
- vocabulary complexity
- maximum board density
- minimum font size
- number of simultaneous symbolic elements
- scaffolding level
- number and complexity of worked steps
- exercise difficulty
- hints and prompts
- expected prerequisite knowledge
- acceptable notation
- validation thresholds
- worksheet differentiation
- quiz distractor complexity
- CTA wording
- curriculum metadata

The grade profile is a default, not a substitute for topic-specific planning.

A Grade 10 lesson may intentionally use slower pacing for a difficult derivation. A Grade 5 lesson may use concise pacing for a simple recap. Such overrides must be explicit, validated, and recorded in the manifest.

Fail validation when:

- grade is missing
- grade is outside 5–10
- curriculum skill and configured grade conflict
- generated terminology materially exceeds the target grade without explanation
- worksheet or quiz content depends on unintroduced higher-grade concepts
- a localisation silently changes the required grade level

Do not create separate Grade 5, Grade 6, Grade 7, Grade 8, Grade 9, and Grade 10 pipelines.

Use one shared pipeline driven by typed grade, grade-band, topic, and locale policies.

---

## 2. Guided Slow Chalk Presentation Preset

Create or refine a production preset named:

```text
guided-slow-chalk
```

Make it the default presentation preset for mathematics lessons in Grades 5–10.

The preset must enforce:

- board-only presentation
- no teacher character
- no hand animation
- persistent board state
- progressive addition of information
- immediate visual response when narration refers to a symbol or step
- large mobile-readable text and mathematical notation
- safe margins for YouTube playback on phones
- minimal camera movement
- camera focus changes only when they improve comprehension
- no unnecessary transitions
- no long periods showing an empty or nearly empty board
- no destructive board clearing unless the scene intentionally moves to a new conceptual section

Use a small semantic colour system:

- white: normal content
- yellow: current focus or active operation
- red: error, misconception, or warning

Colour assignments must be semantic tokens rather than hard-coded renderer-specific values.

Support themes through configuration, but keep the default visually close to a traditional dark chalkboard.

### Board layout requirements

Implement reusable layout regions such as:

- lesson title
- learning objective
- main explanation/work area
- worked example area
- misconception area
- learner task area
- summary/rule area
- fraction and ratio models
- algebraic derivation area
- coordinate system and graph area
- geometry construction area
- table, data, and statistics area
- formula definition and substitution area

Do not show a permanent bottom information bar.

Replace the previous bottom bar with an optional contextual prompt overlay that appears only for:

- learning objectives
- “Your turn” tasks
- countdowns
- pause instructions
- key rules
- recap statements

The overlay must:

- be large enough for phone screens
- avoid obscuring active mathematics
- disappear when no longer needed
- be driven by semantic scene events
- not duplicate normal narration unnecessarily

---

## 3. Narration and Audio Timing

Create or update a narration preset named:

```text
math-grades-5-10-guided
```

Recommended German baseline defaults:

```yaml
targetWordsPerMinute: 130
minimumWordsPerMinute: 120
maximumWordsPerMinute: 145
gradeBandTargets:
  foundation: 127
  intermediate: 132
  upperSecondary: 136
importantPauseMs:
  min: 400
  max: 700
questionPauseMs:
  min: 1000
  max: 2000
exercisePauseSeconds:
  min: 8
  max: 15
```

Requirements:

- Generate naturally slower speech through script structure, punctuation, SSML/provider controls, or provider-native pacing.
- Do not slow completed audio files through crude time stretching unless explicitly configured as a fallback.
- Preserve natural pronunciation and prosody.
- Add pauses after definitions, questions, completed steps, and important rules.
- Derive final visual timing from actual generated audio duration and alignment data.
- Do not rely only on estimated words per minute.
- Support provider capability differences behind a typed abstraction.
- Record effective narration speed, selected grade profile, and pause timing in the render manifest.
- Select narration defaults from the configured grade profile while permitting validated topic-specific overrides.
- Do not assume that older learners always require faster speech; mathematical complexity and cognitive load take precedence.
- Warn or fail when effective pacing falls outside configured limits.
- Avoid speaking mathematical expressions ambiguously.
- Add language-specific pronunciation and verbalisation rules.

German should be the canonical narration timing source for content design, but each localisation must receive independent audio generation and retiming.

---

## 4. Modular Lesson Structure

Implement a typed lesson model that supports the following default sequence:

1. Problem-based hook
2. Student-facing learning objective
3. Brief prerequisite reminder
4. Concept explanation
5. First worked example
6. Additional worked examples
7. Common mistake or misconception
8. Guided learner exercise
9. Independent learner exercise
10. Visible countdown or thinking pause
11. Complete solution
12. Transfer question
13. Final rule or recap
14. Next-lesson call to action

The sequence must be configurable by topic and grade while preserving mandatory pedagogical gates.

For Grades 5–6, prefer more guided checks and shorter transformations.
For Grades 7–8, progressively reduce scaffolding across examples.
For Grades 9–10, support derivations, modelling, graph interpretation, and comparison of strategies where required.


Suggested defaults:

```yaml
durationTargetSeconds:
  min: 240
  max: 360

contentBlocks:
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

Do not solve duration problems by simply increasing narration speed.

When content exceeds six minutes, use deterministic policies such as:

- shorten redundant explanations
- move optional examples into the worksheet
- split the lesson into a clearly linked follow-up lesson
- reject the lesson plan with an actionable validation message

When content is too short:

- add another meaningful example
- add a guided check
- add a transfer question
- improve explanation depth

Never add filler solely to reach a duration target.

---

## 5. Grade-Aware Pedagogical Quality for Grades 5–10

Add explicit pedagogical validation.

Every lesson must be validated against its configured grade, grade band, curriculum skill, and prerequisite graph.

Every lesson must:

- define one narrow learning objective
- use age-appropriate vocabulary
- introduce abbreviations before relying on them
- model each new operation step by step
- explain why a method works, not only what to do
- include at least one likely misconception
- include active learner participation
- include a worked solution after independent thinking time
- end with a compact rule or mental model
- contain at least one transfer task
- avoid introducing unnecessary advanced terminology
- maintain mathematical correctness in narration, visuals, worksheets, and answers
- use representations suitable for the topic, including number lines, fraction models, equations, tables, graphs, coordinate systems, constructions, diagrams, or statistical displays
- distinguish between an example, a general rule, a conjecture, and a proof or justification
- introduce symbols before using them as unexplained shorthand
- preserve units, domains, constraints, and assumptions
- scale board density and abstraction to the configured grade

Create structured validators rather than brittle keyword checks.

Validation must inspect the semantic lesson model and generated artefacts.

Add fail-closed checks for:

- missing learning objective
- missing worked example
- missing independent task
- missing solution
- missing misconception
- missing recap
- inconsistent numbers between narration and board
- incorrect answer key
- invalid mathematical notation
- inaccessible font size
- excessive narration speed
- duration outside the allowed range
- empty or near-empty visual scenes
- visual events occurring before or after the related narration beyond tolerance
- unsupported grade or grade-band configuration
- curriculum skill incompatible with the lesson grade
- use of unintroduced higher-grade prerequisites
- algebraic or geometric transformations that skip required justification
- graphs with incorrect scale, labels, domain, intercepts, or plotted values
- diagrams that are misleadingly drawn to scale when they are not guaranteed to be
- statistics or probability examples with inconsistent totals or impossible values

---

## 6. Localisation Architecture

Use German as the canonical curriculum and content source.

Localise into:

- `de`
- `en`
- `es`
- `fr`
- `pt`

Requirements:

- Reuse the same lesson semantics, equations, examples, board regions, and event identities.
- Do not force identical frame timing across languages.
- Generate language-specific narration.
- Retiming must use the actual duration and alignment of each localised audio track.
- Preserve mathematical equivalence across languages.
- Adapt pedagogical wording rather than translating literally.
- Localise number reading, decimal separators, units, currency examples, punctuation, and terminology appropriately.
- Use locale-specific captions and metadata.
- Detect when translated text no longer fits the intended board region.
- Reflow or resize within safe, configured bounds.
- Reject layouts that become unreadable.
- Store localisation provenance and canonical content hashes.
- Preserve grade, curriculum intent, prerequisite assumptions, and difficulty level across localisations.
- Do not simplify or increase difficulty merely because a language uses shorter or longer wording.

Approval is required separately for every language.

A German approval must not automatically approve English, Spanish, French, or Portuguese.

---

## 7. Full Video Deliverables

For every lesson and language, generate:

```text
video/full/
audio/
captions/
metadata/
thumbnail/
worksheet/
quiz/
reports/
publishing/
```

Use the repository’s established path conventions where possible.

Do not introduce a new incompatible directory structure without a migration strategy.

The full video output must include:

- 16:9 YouTube video
- production-quality encoding
- readable thin lines after YouTube recompression
- normalised and validated audio
- caption file
- chapter markers where appropriate
- deterministic build metadata
- content hash
- render manifest
- validation report

Avoid extremely low-bitrate masters.

Use a quality-oriented encoder configuration such as CRF-based H.264 or an existing higher-quality repository standard.

Make encoding settings configurable and expose the effective values in logs.

---

## 8. YouTube Short Generation

Generate one useful Short per lesson and language.

The Short must:

- teach one complete micro-concept, misconception, or challenge
- work independently from the full lesson
- use 9:16 layout
- contain a strong first-second visual or question
- avoid being only an advertisement
- include a compact answer or resolution
- optionally direct the viewer to the full lesson
- use the same canonical mathematical facts
- have independent captions, metadata, thumbnail/cover data, and validation

Create a Short-specific layout rather than blindly cropping the 16:9 lesson.

---

## 9. Worksheets and Answer Keys

Generate a worksheet and answer key per lesson and language.

The worksheet must include additional exercises beyond those shown in the video.

Use three differentiated sections:

### Support / Easy — relative to the configured grade

- direct repetition of the demonstrated method
- reduced cognitive load
- scaffolding or prompts
- suitable for learners who need reinforcement

### Core / Standard — expected level for the configured grade

- the expected curriculum level for the lesson’s configured grade
- independent application
- moderate variation
- no unnecessary hints

### Transfer / Advanced — extension within the configured grade

- novel context or multi-step reasoning
- comparison, explanation, error analysis, or reverse problems
- still appropriate for the configured grade and curriculum scope
- no content from later grades unless explicitly marked as optional enrichment

Requirements:

- include clear instructions
- use consistent notation with the video
- provide sufficient workspace
- include accessible typography
- include lesson ID, grade, curriculum reference, language, and version
- derive difficulty from the grade profile and skill, not from fixed Grade 5 assumptions
- keep advanced tasks inside the configured grade unless explicitly labelled optional enrichment
- generate a separate answer key
- validate every answer programmatically where feasible
- fail when worksheet questions and answer keys disagree
- support deterministic generation for reproducibility

Prefer structured exercise data as the source of truth.

Render PDFs from that data rather than generating unstructured PDF-only content.

---

## 10. Quiz Generation

Generate structured quiz data for each language.

Use a typed schema such as:

```ts
type QuizQuestion =
  | MultipleChoiceQuestion
  | NumericAnswerQuestion
  | TrueFalseQuestion
  | OrderingQuestion
  | ErrorAnalysisQuestion;
```

Each quiz should contain:

- recall/check question
- standard application question
- misconception question
- transfer question

Include:

- stable question ID
- lesson ID
- locale
- prompt
- answer
- distractors where relevant
- explanation
- difficulty
- curriculum skill
- grade
- grade band
- prerequisite references
- source content reference
- deterministic validation metadata

Quiz answers must be independently checked rather than copied without validation from generated prose.

---

## 11. Thumbnail Generation

Generate one thumbnail per full lesson and language.

Thumbnail requirements:

- 16:9
- mobile-readable
- minimal text
- one clear mathematical challenge or visual
- consistent channel identity
- no clutter
- no misleading result
- language-specific text
- safe margins
- deterministic prompt or template provenance

Do not place an entire exercise paragraph on the thumbnail.

Prefer a concrete visual contrast such as:

```text
73,405 or 730,405?
```

The exact wording must be generated from the lesson topic and validated against the lesson facts.

---

## 12. Metadata and Curriculum Mapping

Generate per-language YouTube metadata:

- title
- description
- tags
- playlist
- chapter markers
- audience setting placeholder/configuration
- publication status
- scheduled publication time
- thumbnail path
- caption path
- Short linkage
- worksheet link placeholder
- canonical lesson ID
- curriculum skill IDs

Generate curriculum metadata including:

- grade
- grade band
- subject
- domain
- skill
- prerequisite skills
- learning objective
- examples covered
- misconceptions covered
- assessment items
- language
- canonical version
- localisation version

Keep metadata generation separate from publication.

Metadata must be reviewable and editable before upload.

---

## 13. Automated YouTube Publishing

Implement or extend a publisher abstraction.

The default workflow must be:

```text
generate
→ validate
→ approve language
→ upload privately
→ attach metadata
→ attach thumbnail
→ attach captions
→ add to playlist
→ verify processing
→ verify remote assets
→ approve publication
→ schedule or publish
```

Required safety behaviour:

- Public publication is fail-closed.
- Upload as private by default.
- Require explicit operator approval per language.
- Record who or what approved the language, when, and against which artefact hashes.
- Invalidate approval when approved artefacts change.
- Do not reuse stale approval after regeneration.
- Support dry-run mode.
- Support private-upload-only mode.
- Support scheduled publishing.
- Support retry after transient API errors.
- Avoid duplicate uploads through idempotency keys and remote video ID persistence.
- Verify the remote video before marking upload complete.
- Store remote identifiers in workflow state.
- Never expose credentials in logs.
- Use OAuth credentials and scopes through the repository’s secure configuration mechanism.
- Verify current YouTube API requirements against official documentation during implementation.
- Do not assume every API capability behaves identically for Shorts, captions, playlists, or scheduled publication.
- Return actionable errors when an operation requires manual channel configuration or API project verification.

Use a typed publishing manifest containing at least:

```ts
interface PublishingManifest {
  lessonId: string;
  locale: string;
  artefactHashes: Record<string, string>;
  approvalStatus: "pending" | "approved" | "rejected" | "invalidated";
  uploadStatus:
    | "not_started"
    | "uploading"
    | "processing"
    | "private"
    | "scheduled"
    | "public"
    | "failed";
  remoteVideoId?: string;
  remotePlaylistItemId?: string;
  scheduledAt?: string;
  approvedAt?: string;
  approvedBy?: string;
}
```

Adapt this interface to existing repository types rather than duplicating a working equivalent.

---

## 14. Workflow State, Resume, Caching, and Idempotency

Integrate the enhancements into the existing workflow system.

Every step must be:

- resumable
- idempotent
- observable
- cache-aware
- independently retryable
- safely invalidated when dependencies change

Track tasks such as:

```text
grade-profile
lesson-plan
script
localisation
audio
alignment
scene-plan
full-render
short-render
thumbnail
worksheet
answer-key
quiz
captions
metadata
validation
language-approval
private-upload
remote-verification
publication-approval
scheduled-publication
```

Workflow records must include:

- task name
- status
- started time
- completed time
- exit code
- error summary
- command
- input hashes
- output hashes
- cache result
- retry count
- dependency state
- next recommended tasks

Do not mark a workflow step complete merely because a target file exists.

Verify the file and its manifest.

---

## 15. CLI Design

Inspect the existing CLI and integrate these capabilities without creating duplicate command families.

The final CLI should be discoverable and flow-oriented.

Support commands equivalent to:

```bash
youtube math lesson plan <lesson-id> --grade <5-10>
youtube math lesson generate <lesson-id> --locale de
youtube math lesson generate <lesson-id> --all-locales
youtube math lesson validate <lesson-id> --locale de
youtube math lesson approve <lesson-id> --locale de
youtube math lesson upload <lesson-id> --locale de --private
youtube math lesson publish <lesson-id> --locale de --schedule "..."
youtube math lesson status <lesson-id>
youtube math lesson next <lesson-id>
youtube math lesson run <lesson-id> --until private-upload
```

Use the repository’s actual root command and naming conventions.

Requirements:

- helpful `--help`
- examples
- dry-run support
- machine-readable JSON output
- human-readable output
- clear exit codes
- explicit destructive or public actions
- no ambiguous defaults for public publication
- locale filtering
- grade filtering and validation
- batch selection by grade, grade band, curriculum domain, and skill
- clear errors when a lesson ID conflicts with `--grade`
- resume support
- batch support
- concurrency limits
- structured logs
- actionable next-step output

---

## 16. Configuration

Centralise configuration.

Avoid environment-variable sprawl.

Use typed, validated configuration for:

- supported grades
- grade-band profiles
- presentation preset
- narration preset
- target duration
- locale list
- WPM bounds
- pause ranges
- exercise counts
- worksheet differentiation
- render resolution
- encoder quality
- caption format
- publishing privacy
- approval policy
- playlist mapping
- scheduling policy
- concurrency
- retry policy
- cache policy

Reject invalid configuration during startup.

Document all defaults.

---

## 17. Observability and Diagnostics

Add structured logs and metrics for:

- generation duration by step
- audio duration
- measured WPM
- pause count and length
- scene count
- empty-board duration
- render duration
- cache hit/miss
- validation failures
- upload duration
- YouTube processing state
- retries
- approval state
- publication state

Use correlation fields such as:

```text
lessonId
grade
gradeBand
locale
workflowRunId
task
artefactHash
provider
remoteVideoId
```

Do not log:

- OAuth tokens
- API secrets
- raw private credentials
- binary file contents
- base64 media

Produce a concise per-language quality report.

---

## 18. Testing Requirements

Add or update:

### Unit tests

- lesson schema validation
- grade and grade-band resolution
- curriculum-skill compatibility
- grade-profile override validation
- content block selection
- duration budgeting
- narration pacing rules
- pause insertion
- colour semantic mapping
- board layout
- localisation reflow
- worksheet differentiation
- answer validation
- quiz validation
- publishing state transitions
- approval invalidation
- cache keys
- idempotency keys

### Integration tests

- lesson plan to full render
- German canonical lesson to localised lesson
- audio alignment to visual timing
- worksheet and answer-key generation
- Short generation
- metadata generation
- private upload using a mocked or sandboxed publisher
- retry and resume behaviour
- approval per language
- changed artefact invalidates approval
- duplicate invocation does not duplicate upload

### Golden or snapshot tests

Use them carefully for:

- scene plans
- manifests
- worksheet structured data
- metadata
- CLI output

Do not rely only on snapshots for mathematical correctness.

### End-to-end acceptance fixtures

Create or use at least three representative fixtures:

1. **Grades 5–6 foundation fixture**
   - Grade 5 place value, fractions, or measurement
   - concrete visual representation
   - explicit vocabulary introduction
   - multiple examples
   - guided and independent tasks

2. **Grades 7–8 intermediate fixture**
   - Grade 7 or 8 linear equations, percentages, proportional reasoning, geometry, or probability
   - transition between verbal, tabular, graphical, and symbolic forms where appropriate
   - progressively reduced scaffolding
   - error analysis

3. **Grades 9–10 upper-secondary fixture**
   - Grade 9 or 10 functions, Pythagorean theorem, trigonometric foundations, quadratic relationships, statistics, probability, or modelling
   - justified multi-step transformation or derivation
   - graph, diagram, or model validation
   - examination-style transfer task

Across the fixtures, demonstrate:

- configured grade and grade-band selection
- learning objective
- prerequisite validation
- multiple examples
- common mistakes
- guided tasks
- independent tasks
- countdowns or thinking pauses
- complete solutions
- transfer tasks
- final rules or conclusions
- full videos
- Shorts
- worksheets
- answer keys
- quizzes
- thumbnails
- German and at least one additional locale
- language-specific approval
- private upload dry run
- no cross-grade leakage of terminology or prerequisites

At least one fixture must exercise coordinate graphs or geometric diagrams, not only arithmetic text.


---

## 19. Performance Requirements

Optimise for low-resource Linux machines without sacrificing correctness.

Requirements:

- reuse rendered static board layers
- cache fonts and glyphs
- avoid re-rendering unchanged scenes
- stream or chunk large media operations
- limit concurrent audio and video jobs
- expose concurrency configuration
- reuse canonical structured lesson data across languages
- only retime or rerender language-dependent portions when possible
- use content-addressed caching
- clean temporary files safely
- support interrupted renders
- avoid loading full videos into memory
- preserve deterministic outputs where practical

Document expected bottlenecks and recommended concurrency for low-end hardware.

---

## 20. Backward Compatibility and Migration

Do not break existing horror or other content pipelines.

Do not change global defaults unless the change is explicitly scoped to educational mathematics.

If existing math lessons or schemas assume Grade 5:

- preserve compatibility where safe
- infer Grade 5 only for clearly versioned legacy records when deterministic
- otherwise require explicit migration
- add grade and grade-band fields to migrated manifests
- do not silently classify unknown legacy lessons as Grade 5

If existing math lessons use the old fast preset:

- preserve the old preset
- add a migration path
- make `guided-slow-chalk` the new default for Grades 5–10
- allow explicit use of the legacy preset
- document behaviour changes

If schemas change:

- add migration or compatibility parsing
- include schema versions
- reject unsupported future versions clearly

---

## 21. Implementation Strategy

Implement in safe, reviewable batches.

Recommended order:

1. Repository audit and duplication map
2. Typed grade model, grade-band profiles, and curriculum compatibility rules
3. Typed configuration and schema changes
4. Guided slow chalk preset
5. Narration pacing and timing
6. Modular lesson structure
7. Grade-aware pedagogical validators
8. Localisation retiming
9. Worksheet, answer key, and quiz generation
10. Short and thumbnail generation
11. Metadata and curriculum mapping
12. Approval state model
13. Private upload and publishing workflow
14. CLI integration
15. Observability
16. Unit, integration, and end-to-end tests
17. Documentation and migration notes
18. Final acceptance run across all three grade bands

After each batch:

- run relevant tests
- run type checking
- run linting
- record changed files
- record unresolved risks
- do not continue with a broken baseline

Prefer small commits if repository tooling supports them.

Do not use destructive Git operations.

Do not discard unrelated working-tree changes.

---

## 22. Acceptance Criteria

The implementation is accepted only when all of the following are true:

- `guided-slow-chalk` exists and is the default presentation preset for Grades 5–10.
- Grades 5–10 are supported by one shared typed pipeline.
- Every lesson carries a validated grade and grade-band profile.
- Curriculum skills, prerequisites, terminology, exercises, and validation are grade-aware.
- Board content remains visible while new content is added.
- No teacher avatar or hand is rendered.
- No permanent bottom information bar is shown.
- Contextual prompts are mobile-readable.
- German narration uses grade-aware defaults within the agreed controlled pacing range.
- Foundation lessons generally target approximately 125–130 WPM.
- Intermediate lessons generally target approximately 130–135 WPM.
- Upper-secondary lessons generally target approximately 130–140 WPM, never exceeding the configured hard limit without validation failure.
- Effective WPM is measured from actual audio.
- Lessons target 240–360 seconds.
- Lessons support multiple examples and exercises.
- Every lesson contains a misconception and transfer task.
- German is canonical.
- Every target locale receives independent retiming.
- Approval is separate per language.
- Regeneration invalidates stale approval.
- Full video, Short, thumbnail, worksheet, answer key, quiz, captions, metadata, and reports are generated.
- Worksheets contain support, core, and transfer sections.
- Worksheet answers are validated.
- Videos upload privately by default.
- Public or scheduled publication requires explicit approval.
- Duplicate commands do not create duplicate remote uploads.
- Workflow state is resumable and idempotent.
- Existing non-math functionality remains operational.
- Type checking, linting, and all relevant tests pass.
- Representative foundation, intermediate, and upper-secondary end-to-end lessons pass all quality gates.
- At least one acceptance fixture validates graphs or geometry, not only arithmetic.
- Documentation explains setup, commands, configuration, approval, and publishing.

---

## 23. Required Final Deliverables

At the end, provide:

1. Repository audit summary
2. Architecture decisions
3. Duplicate implementation findings
4. Grade/profile support matrix for Grades 5–10
5. Files changed
6. New or changed schemas
7. New CLI commands
8. Configuration defaults
9. Migration notes
10. Test results
11. End-to-end fixture results for all three grade bands
12. Remaining risks
13. Manual setup still required
14. Exact commands for:
    - generating one German lesson
    - generating all locales
    - validating one locale
    - approving one locale
    - uploading privately
    - scheduling publication
    - checking workflow status
    - resuming after failure

Also update the repository’s AI/content pack or equivalent architecture documentation so the latest implementation can be supplied back to ChatGPT for future review.

---

## Non-Negotiable Engineering Standards

- Strict TypeScript
- No unjustified `any`
- Explicit domain types
- Runtime validation at external boundaries
- Dependency injection where consistent with the repository
- Clear module boundaries
- Secure credential handling
- Deterministic state transitions
- Structured errors
- Actionable logs
- Idempotent external operations
- Unit and integration coverage
- Mathematical correctness
- Explicit grade and prerequisite correctness
- No hidden Grade 5 assumptions
- Accessibility and mobile readability
- No silent fallback that can publish incorrect content
- No public upload without explicit approval
- No duplicate parallel pipeline unless technically unavoidable and documented

Begin by auditing the repository, including all hidden Grade 5 assumptions, then implement the complete Grades 5–10 solution in safe batches and verify it against the acceptance criteria.
