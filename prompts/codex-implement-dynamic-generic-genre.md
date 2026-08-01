# Codex Implementation Prompt — Dynamic Generic Genre Compiler

## Execution mode

Implement this task directly in the repository.

Use **multi-agent mode** with parallel work only where file ownership and dependency boundaries make it safe. Do not stop after producing a plan. Complete implementation, integration, tests, documentation, and verification.

Recommended execution settings:

- Primary model: `gpt-5.6-sol`
- Reasoning effort: `high`
- Maximum concurrent implementation agents: `4`
- Run from the repository root
- Preserve all uncommitted user work
- Do not use destructive Git commands
- Do not create overlapping edits across agents
- Do not silently weaken tests, schemas, validation, security controls, or existing genre behavior

---

# Role

Act as a principal TypeScript architect, generative-media pipeline engineer, and production reliability reviewer.

This repository is an existing YouTube production system with at least these genres:

- Horror
- Math education
- `veronicaBenini`

It may already include:

- Story generation and localization
- Canonical story or episode artifacts
- Genre configuration and preset registries
- Prompt templates
- Audio and TTS generation
- An OpenAI TTS provider
- Optional ElevenLabs cloned-voice support
- Image generation
- Thumbnail generation
- Video composition and rendering
- Shorts and long-form production
- Publishing workflows
- CLI and API entry points
- Episode manifests
- Per-episode workflow logs
- Validation, observability, and cost controls

Do not assume exact paths, package names, APIs, or architectural patterns. Discover them from the repository and follow the established conventions.

---

# Primary objective

Implement a new **generic dynamic genre** that derives creative production settings from an input story or structured outline before generating audio, images, thumbnails, or video.

The required architecture is:

```text
Input content
  -> canonical content normalization
  -> story/content analysis
  -> structured CreativeBrief
  -> validated DynamicGenreProfile
  -> deterministic domain compilers
  -> ResolvedProductionConfig
  -> existing production pipeline
```

The central security and architecture boundary is:

```text
DynamicGenreProfile = model-derived creative intent
ResolvedProductionConfig = trusted executable application configuration
```

The language model may derive creative intent.

Only trusted application code may produce executable provider and renderer configuration.

---

# Non-negotiable requirements

## 1. Preserve existing genres

Do not regress or silently change the behavior of:

- Horror
- Math education
- `veronicaBenini`

Existing genre-specific implementations remain first-class.

The new dynamic genre must use shared abstractions where appropriate, but do not force risky rewrites merely to make the architecture look uniform.

Add compatibility tests proving that existing genres still resolve to equivalent production behavior for representative fixtures.

## 2. Model output must not be executable configuration

The model must never be allowed to supply arbitrary:

- Provider names
- Provider endpoints
- Model identifiers
- Voice IDs
- Cloned-voice identities
- Filesystem paths
- Template paths
- Shell commands
- FFmpeg arguments
- Environment variable names
- Output filenames
- Bucket or storage destinations
- Queue names
- Arbitrary CSS
- Arbitrary renderer code
- Arbitrary prompt templates
- Publishing credentials
- Cost limits
- Retry limits
- Unsafe free-form configuration fragments

Model output must be constrained to versioned, allowlisted semantic fields, enums, bounded numbers, and short descriptive fields where necessary.

Trusted application code must map those fields onto existing internal presets and provider abstractions.

## 3. Explicit voice boundary

The dynamic genre may derive semantic narration requirements such as:

- Calm, authoritative, warm, suspenseful, energetic
- Narration pace
- Expressiveness
- Pause density
- Emotional intensity
- Pronunciation or locale requirements

It must not automatically select a personal cloned voice.

A cloned voice may only be used when an operator or existing genre configuration explicitly authorizes and selects it. Preserve the repository's existing voice-consent and provider-selection rules.

## 4. Determinism and provenance

For each derived profile, persist enough provenance to reproduce and audit the decision:

- Input content hash
- Canonical content version or revision
- Genre-analysis schema version
- Prompt/template version
- Analyzer implementation version
- Provider and model metadata already exposed by the repository
- Analysis timestamp
- Raw structured provider response, subject to existing privacy policy
- Parsed and validated profile
- Validation/repair attempts
- Confidence and warnings
- Selected base profile
- Applied policy constraints
- Applied user overrides
- Final resolved production configuration hash
- Production budget tier
- Locale/language context

Reuse the repository's episode manifest and workflow-log mechanisms rather than introducing a disconnected tracking system.

## 5. Idempotency and caching

Do not repeatedly analyze unchanged content.

Use a stable cache/idempotency key derived from at least:

```text
canonicalContentHash
+ analyzerSchemaVersion
+ promptVersion
+ relevant system policy version
+ requested budget tier
```

Language-independent visual analysis should normally be reusable across translations of the same canonical content.

Language-specific narration resolution may be compiled separately without re-running the complete creative analysis.

## 6. Validation and safe fallback

Use strict runtime validation.

Preferred approach:

- Existing schema framework, if one is already standard in the repository
- Otherwise Zod or JSON Schema with a single source of truth
- No unsafe `as` casts at trust boundaries
- No permissive unknown-property handling
- Bounded strings, arrays, numbers, and enum values
- Clear distinction between missing, invalid, and unsupported fields

Implement a bounded repair strategy:

1. Request structured output.
2. Validate.
3. If invalid, run at most the repository-approved repair retry count.
4. Validate the repaired result.
5. If still invalid, use a deterministic neutral fallback profile.
6. Record the failure and fallback in logs, metrics, and the episode workflow.

Never continue with partially trusted model output.

## 7. Low-confidence behavior

Implement configurable confidence thresholds.

Recommended default behavior:

- High confidence: accept the validated dynamic profile.
- Medium confidence: accept with warnings and conservative compilation.
- Low confidence: use the nearest safe base profile or neutral fallback.
- Critical ambiguity or conflicting safety signals: require explicit operator review when the workflow supports review; otherwise use the neutral fallback.

Do not block unattended batch production indefinitely.

## 8. Layered configuration precedence

Implement and document this precedence:

```text
System safety and policy constraints
  -> environment/deployment constraints
  -> selected production budget tier
  -> existing genre/base-profile constraints
  -> AI-derived DynamicGenreProfile
  -> explicit episode/user overrides
  -> deterministic normalization and final validation
```

User overrides must not bypass system safety, provider policy, cost ceilings, or capability constraints.

---

# Required domain model

Adapt names to repository conventions, but retain the separation of concerns.

## CreativeBrief

The `CreativeBrief` is the canonical semantic analysis of the content. It should include enough information to support audio, images, video, thumbnails, and metadata without reinterpreting the story independently at every stage.

At minimum, model:

- Content type
- Primary genre
- Secondary genres
- Genre confidence
- Target audience
- Suggested age band or rating
- Educational level where applicable
- Tone and emotional palette
- Narrative pacing
- Emotional arc
- Narrative point of view
- Theme and subject matter
- Setting and time period
- Character roster
- Character visual anchors
- Location roster
- Important recurring objects
- Continuity constraints
- Sensitive-content signals
- Visual motifs
- Audio mood
- Thumbnail communication goal
- Recommended duration class
- Scene density
- Mixed-genre information
- Analysis warnings
- Evidence references into the input content where practical

Avoid storing unnecessarily verbose model prose.

## DynamicGenreProfile

Create a versioned, runtime-validated profile similar in intent to the following. Modify the exact shape to match the repository.

```ts
interface DynamicGenreProfileV1 {
  readonly schemaVersion: '1.0';

  readonly classification: {
    readonly primaryGenre: GenreId;
    readonly secondaryGenres: readonly GenreId[];
    readonly confidence: number;
    readonly selectedBaseProfile: BaseProfileId;
  };

  readonly audience: {
    readonly ageBand: AgeBand;
    readonly knowledgeLevel?: KnowledgeLevel;
    readonly contentSensitivity: ContentSensitivity;
  };

  readonly narrative: {
    readonly tones: readonly ToneId[];
    readonly pacing: PacingId;
    readonly emotionalArc: EmotionalArcId;
    readonly pointOfView: PointOfViewId;
  };

  readonly visual: {
    readonly stylePreset: VisualStyleId;
    readonly lighting: LightingId;
    readonly paletteMood: PaletteMoodId;
    readonly cameraLanguage: CameraLanguageId;
    readonly continuityMode: ContinuityModeId;
    readonly sceneDensity: number;
  };

  readonly audio: {
    readonly narrationStyle: NarrationStyleId;
    readonly speechRate: number;
    readonly expressiveness: number;
    readonly pauseDensity: number;
    readonly musicMoods: readonly MusicMoodId[];
    readonly soundDesignIntensity: number;
  };

  readonly thumbnail: {
    readonly strategy: ThumbnailStrategyId;
    readonly emotionalSignal: ThumbnailEmotionId;
    readonly textDensity: ThumbnailTextDensityId;
  };

  readonly production: {
    readonly durationClass: DurationClassId;
    readonly imageStrategy: ImageStrategyId;
    readonly motionIntensity: number;
    readonly transitionStyle: TransitionStyleId;
  };

  readonly safety: {
    readonly rating: ContentRatingId;
    readonly flags: readonly SafetyFlagId[];
    readonly requiresReview: boolean;
  };

  readonly warnings: readonly ProfileWarning[];
}
```

Use branded types or schema-inferred types where useful. Keep types immutable where repository conventions permit.

## ResolvedProductionConfig

The resolved configuration must be produced by deterministic application code and contain the executable settings required by the existing pipeline.

It may include trusted selections such as:

- Existing TTS provider abstraction
- Authorized voice reference
- Existing image provider and model policy
- Renderer preset
- Resolution/aspect ratio
- Frame rate
- Audio normalization target
- Existing speech-speed controls
- Prompt template identifiers
- Transition implementation
- Image count and scene allocation
- Thumbnail renderer preset
- Retry and timeout policies
- Budget ceilings
- Publishing defaults

The model must not construct this object directly.

---

# Base-profile strategy

The generic genre should support mixed genres while reusing existing production knowledge.

Implement a base-profile registry containing safe, application-defined profiles such as:

- Neutral narrative
- Horror-compatible
- Educational-compatible
- Presenter/advice-compatible
- Documentary
- Children/family
- Comedy/light entertainment
- Inspirational
- Business/explainer
- Historical
- Science/technology
- Abstract/experimental, only if the existing renderer safely supports it

Map inferred semantic genre IDs to the nearest supported base profile.

The existing Horror, Math, and `veronicaBenini` genres may contribute reusable presets, but the generic genre must not blindly impersonate or select a named person's cloned voice.

For a strong match to an existing genre, choose one of the following based on repository architecture:

1. Delegate to the existing genre after explicit classification and compatibility checks.
2. Reuse its allowlisted base profile through the shared resolver.
3. Compile an equivalent generic profile without changing the existing genre code path.

Document the chosen approach and why it minimizes regression risk.

---

# Production budget tiers

Support at least:

- `economy`
- `standard`
- `premium`

Budget tiers are application-controlled, not model-controlled.

They should deterministically constrain:

- Maximum analysis calls
- Number of scenes
- Number of generated images
- Image resolution or quality preset
- Motion complexity
- Music/SFX complexity
- Retry counts within global policy
- Maximum target duration
- Thumbnail variants
- Optional quality-review passes

The model may recommend creative density, but the budget compiler decides the actual limits.

---

# Input support

Initially support:

1. Completed story
2. Structured story outline

If the repository already has normalized types for transcripts, articles, lessons, scripts, or rough ideas, integrate them only when this can be done without destabilizing the implementation.

Normalize all supported inputs into a canonical analysis input with:

- Stable content ID
- Revision/version
- Locale
- Canonical language where available
- Title
- Body/sections
- Structured characters/events where available
- Source metadata
- Content hash

Reject empty or structurally invalid input before making an external model call.

---

# Analyzer implementation

Create a dedicated application service/port for dynamic genre analysis.

Suggested responsibilities:

```ts
interface DynamicGenreAnalyzer {
  analyze(
    input: CanonicalGenreAnalysisInput,
    context: GenreAnalysisContext,
  ): Promise<GenreAnalysisResult>;
}
```

The service must:

- Build a compact, versioned analysis prompt
- Use the repository's existing LLM/OpenAI abstraction
- Request schema-constrained structured output
- Apply timeouts and cancellation
- Apply existing retry policy
- Validate all output
- Perform bounded repair when required
- Emit typed domain errors
- Return warnings rather than hiding degraded behavior
- Support deterministic test doubles
- Avoid leaking full story content into normal application logs

Do not introduce a second direct OpenAI client if an abstraction already exists.

Keep prompt construction separate from orchestration and validation.

## Prompt requirements

The analysis prompt should instruct the model to:

- Analyze, not rewrite, the input
- Select only from supplied enums and ranges
- Identify mixed genres
- Separate visual and audio intent
- Avoid arbitrary implementation details
- Avoid choosing providers or personal voices
- Flag ambiguity
- Flag sensitive content
- Preserve canonical story facts
- Produce concise structured output
- Provide confidence and warnings
- Prefer conservative classifications when evidence is weak

Store the prompt as a versioned template according to repository conventions.

---

# Deterministic compilers

Implement small, testable compilers/resolvers rather than a single giant mapper.

Expected conceptual modules:

- Base-profile selector
- Audience/safety compiler
- Audio-profile compiler
- Visual-profile compiler
- Scene-density compiler
- Thumbnail-profile compiler
- Duration compiler
- Budget compiler
- Locale-specific narration compiler
- Override merger
- Capability normalizer
- Final production-config validator

Each compiler must:

- Be deterministic
- Be pure where practical
- Accept typed input
- Return typed output
- Clamp bounded values
- Record normalization warnings
- Avoid silently selecting unsupported capabilities

The final resolver should return:

```ts
interface ResolvedDynamicGenre {
  readonly creativeBrief: CreativeBrief;
  readonly dynamicProfile: DynamicGenreProfile;
  readonly productionConfig: ResolvedProductionConfig;
  readonly provenance: DynamicGenreProvenance;
  readonly warnings: readonly ResolutionWarning[];
}
```

---

# Pipeline integration

Integrate the dynamic genre into all relevant entry points discovered in the repository.

Potential integration points include:

- Genre registry
- Episode creation
- Story import
- CLI commands
- API requests
- Workflow orchestration
- Audio generation
- Image prompt generation
- Scene planning
- Video composition
- Thumbnail generation
- Shorts generation
- Long-form generation
- Localization
- Publishing metadata
- Episode status/workflow logs

Do not duplicate existing production implementations.

The dynamic genre should resolve its production configuration once, persist it, and make downstream stages consume the persisted resolved artifact.

Do not let audio, image, video, and thumbnail stages independently call the model to reinterpret the same story.

## Re-analysis rules

Re-run analysis only when a relevant dependency changes, such as:

- Canonical story content
- Analysis schema
- Prompt version
- Policy version
- Explicit force-refresh request
- An override that requires semantic re-analysis

Do not re-run full creative analysis merely because:

- Audio is regenerated
- A localized voice changes
- An image generation retry occurs
- Rendering is resumed
- Publishing metadata is regenerated

---

# CLI and API behavior

Discover the existing command and API style.

Add equivalent support for the generic genre without creating an inconsistent command family.

The interface should support, where appropriate:

- Selecting `generic` or `dynamic` as genre
- Passing input story/outline
- Selecting budget tier
- Providing explicit safe overrides
- Previewing the inferred profile
- Forcing re-analysis
- Reusing an existing profile
- Showing warnings and confidence
- Printing the path or ID of persisted profile artifacts
- Dry-run/profile-only mode
- Machine-readable output
- Resuming production from the workflow log

Prefer a flow such as:

```text
analyze -> review/resolve -> produce -> publish
```

If the repository has an existing flow-based CLI, extend it rather than inventing new top-level commands.

API contracts must be versioned and documented using existing OpenAPI or schema tooling.

---

# Overrides

Support typed, bounded overrides.

Examples:

- Narration pace
- Visual preset
- Base profile
- Duration class
- Scene density
- Image strategy
- Music intensity
- Thumbnail strategy
- Budget tier
- Require/manual review decision

Do not support arbitrary JSON patching into executable config.

Validate overrides against:

- System policy
- Genre capabilities
- Budget tier
- Provider capabilities
- Locale
- Content safety rating

Persist both requested and effective overrides.

---

# Character and world continuity

Where the content is narrative, derive and persist:

- Character identity
- Physical traits
- Clothing anchors when narratively relevant
- Age category
- Recurring props
- Location anchors
- Time-period anchors
- Relationships
- Visual exclusions
- Scene-to-scene continuity constraints

Integrate with the existing story bible and reference-image system when present.

For Horror content, preserve the importance of story-bible and reference-image continuity.

For educational content, continuity can be lighter unless the lesson uses a recurring teacher, board state, diagrams, or visual objects.

Do not allow the analyzer to overwrite canonical facts.

---

# Image and scene prompt integration

The dynamic profile must influence image and scene generation through trusted prompt builders.

The prompt builder may use:

- Creative brief
- Selected visual preset
- Character/location continuity
- Scene facts
- Lighting
- Camera language
- Palette mood
- Safety constraints
- Aspect ratio
- Target platform
- Budget tier

Keep negative constraints and safety rules application-controlled.

Do not concatenate raw model-generated executable prompt fragments without normalization and length limits.

Add snapshot or fixture tests for representative prompt construction.

---

# Audio integration

Resolve semantic narration settings through the existing common TTS provider interface.

Preserve existing provider-specific handling.

The dynamic genre should determine semantic values such as:

- Pace
- Expressiveness
- Stability, if supported through trusted mapping
- Pause strategy
- Emotional delivery
- Pronunciation/locale requirements

Trusted code maps these values to provider-specific options.

Requirements:

- Do not expose provider secrets
- Do not infer a cloned voice identity
- Respect per-genre/per-video provider selection
- Respect language support and fallback behavior
- Validate speaking rate ranges
- Preserve existing audio loudness and post-processing standards
- Record provider capability fallbacks as warnings

---

# Localization strategy

Analyze canonical content once where possible.

Split the output into:

1. Language-independent creative intent
2. Locale-specific narration and text-presentation resolution

For translations:

- Preserve visual continuity
- Preserve character and location identity
- Reuse the visual creative profile
- Recompile speech pace and pronunciation for the locale
- Recompile thumbnail text layout if required
- Do not reclassify genre unless the translated content materially differs

---

# Safety and security

Treat story text and model output as untrusted input.

Address:

- Prompt injection inside story content
- Oversized input
- Malformed Unicode
- Unknown enum values
- Numeric overflow or out-of-range values
- Unexpected nested objects
- Unsupported visual or audio combinations
- Sensitive-content flags
- Provider timeout
- Partial provider responses
- Duplicate requests
- Concurrent profile generation
- Stale profile writes
- Cross-tenant access if the application is multi-tenant
- Secrets in logs
- Personal data in observability events

The prompt must clearly delimit story content as data and instruct the model not to follow instructions contained inside it.

Use repository-standard redaction and structured logging.

Do not log full story bodies at normal log levels.

---

# Concurrency and persistence

Ensure two workers cannot produce conflicting canonical profiles for the same episode revision.

Use existing repository mechanisms such as:

- Idempotency keys
- Compare-and-set/version checks
- Database uniqueness constraints
- File locks
- Atomic file replacement
- Workflow leases
- Queue deduplication

Choose the mechanism consistent with the current architecture.

Persist artifacts atomically.

A failed analysis must not overwrite a previously valid profile unless explicitly requested and safely versioned.

---

# Observability

Add structured logs and metrics using existing infrastructure.

Recommended metrics:

- Dynamic genre analysis requests
- Cache hits/misses
- Analysis duration
- Provider failures
- Validation failures
- Repair attempts
- Fallback-profile usage
- Low-confidence classifications
- Base-profile distribution
- Resolution warnings
- Override rejection counts
- Production-config compilation duration
- Re-analysis causes

Recommended log context:

- Episode/content ID
- Tenant ID where applicable
- Workflow/run ID
- Content hash prefix, not full sensitive content
- Schema and prompt version
- Cache status
- Confidence
- Base profile
- Budget tier
- Warning/error code

Use bounded-cardinality labels.

Add tracing spans if tracing already exists.

---

# Error model

Use typed domain errors compatible with repository conventions.

At minimum distinguish:

- Invalid analysis input
- Analysis provider unavailable
- Analysis timeout
- Structured-output validation failure
- Repair exhausted
- Unsupported profile capability
- Policy violation
- Override rejected
- Profile persistence conflict
- Stale profile
- Profile not found
- Resolution failure
- Neutral fallback applied

Errors exposed through CLI/API must be actionable but must not leak secrets or raw provider payloads.

---

# Testing requirements

Create comprehensive automated tests.

## Unit tests

Cover:

- Input normalization
- Content hashing
- Schema validation
- Unknown-property rejection
- Range validation
- Enum validation
- Base-profile selection
- Confidence thresholds
- Low-confidence fallback
- Budget compilation
- Audio compilation
- Visual compilation
- Thumbnail compilation
- Duration compilation
- Override precedence
- Override rejection
- Capability normalization
- Locale-specific compilation
- Cache-key generation
- Provenance construction
- Prompt-injection containment
- Typed error mapping

## Contract tests

Cover the analyzer/provider boundary with deterministic fixtures:

- Valid response
- Invalid JSON
- Schema mismatch
- Unknown enum
- Out-of-range number
- Truncated response
- Timeout
- Retry
- Repair succeeds
- Repair fails
- Neutral fallback

No live API dependency in the default test suite.

## Integration tests

Cover at least:

1. Generic story -> profile -> audio/image/video configuration
2. Generic outline -> profile
3. Cached repeated analysis
4. Content revision triggers re-analysis
5. Existing valid profile survives failed refresh
6. Episode override changes resolved config without unsafe mutation
7. Localization reuses visual intent
8. Workflow resume consumes the persisted profile
9. Concurrent resolution is idempotent
10. CLI/API profile preview
11. Existing Horror flow remains compatible
12. Existing Math flow remains compatible
13. Existing `veronicaBenini` flow remains compatible

## Representative fixtures

Include fixtures such as:

- Supernatural suspense story
- Children's fable
- Historical documentary narrative
- Business/advice script
- Educational math explanation
- Mixed educational suspense story
- Calm reflective personal-development script
- Ambiguous short outline
- Prompt-injection attempt embedded in story text
- Sensitive-content example
- Empty and oversized inputs

Assertions should focus on stable semantic and configuration contracts, not brittle full-response text.

## End-to-end smoke test

Add or extend a non-live smoke test that proves:

```text
input
-> dynamic analysis fixture
-> validated profile
-> resolved production config
-> downstream stage preparation
-> workflow-log completion
```

Use mocked external generation providers unless the repository already has an explicit opt-in live test suite.

---

# Backward compatibility and migration

Do not require migration of all historical episodes unless necessary.

Support historical episodes that have no dynamic profile.

If schema persistence changes are required:

- Add forward migration
- Add rollback guidance where repository practice expects it
- Add versioned readers
- Do not reinterpret old profiles silently
- Keep old artifacts readable
- Add explicit migration tooling only if needed

If file-based artifacts are used, choose versioned names such as:

```text
creative-brief.v1.json
dynamic-genre-profile.v1.json
resolved-production-config.v1.json
```

Adapt names to existing conventions.

---

# Documentation

Update repository documentation with:

- Architecture overview
- Trust boundary
- Dynamic profile schema
- Base-profile registry
- Configuration precedence
- Cache and invalidation behavior
- Workflow sequence
- CLI examples
- API examples
- Override examples
- Budget tiers
- Failure/fallback behavior
- Voice-selection boundary
- Localization behavior
- Observability
- Testing instructions
- Extension guide for new presets and enum values
- Migration notes
- Operational runbook

Add a Mermaid diagram when repository documentation supports it.

Document how to add a new semantic enum without allowing arbitrary executable configuration.

---

# Multi-agent execution plan

Use the following staged execution model. Adjust agent names to available Codex tooling, but preserve ownership boundaries.

## Phase 0 — Coordinator discovery

The coordinator must inspect:

- Repository structure
- `AGENTS.md` files
- Package manager and workspace layout
- Genre registry and existing genre implementations
- Story/canonical-content types
- Episode artifacts and workflow logs
- LLM/OpenAI provider abstractions
- Audio/TTS provider abstractions
- ElevenLabs integration
- Image/video/thumbnail pipeline
- CLI/API contracts
- Persistence model
- Schema/validation libraries
- Logging/metrics/tracing
- Test conventions
- Relevant docs and decision records
- Current uncommitted changes

Create a concise implementation map containing:

- Existing components to reuse
- New components required
- Exact file ownership for each agent
- Shared contracts that must be created first
- Integration risks
- Test commands
- Files that no sub-agent may edit concurrently

Do not spend the entire run documenting. Proceed to implementation.

## Phase 1 — Contract freeze

The coordinator or one designated contract agent creates the minimal shared contracts first:

- Domain terminology
- Versioned schema/types
- Public interfaces/ports
- Error codes
- Artifact names
- Provenance contract
- Resolver input/output
- Agent ownership map

Run type checking for the affected package.

After contracts are stable, start parallel agents.

## Phase 2 — Parallel implementation

Use up to four concurrent agents.

### Agent A — Domain, schema, persistence, provenance

Own only the agreed domain/schema/persistence files.

Responsibilities:

- `CreativeBrief`
- `DynamicGenreProfile`
- Runtime schemas
- Versioning
- Provenance
- Artifact persistence
- Atomic/idempotent writes
- Cache key
- Migration support
- Domain errors
- Unit tests for owned modules

Must not edit pipeline integration files owned by another agent.

### Agent B — Analyzer and structured-output boundary

Own only analyzer/provider/prompt files.

Responsibilities:

- Canonical analysis input
- Prompt template
- Prompt-injection boundary
- LLM provider adapter integration
- Structured-output request
- Validation
- Bounded repair
- Timeout/cancellation
- Neutral fallback creation
- Analyzer tests and fixtures

Must use the shared contracts from Phase 1.

Must not add a new direct provider client when an existing abstraction exists.

### Agent C — Deterministic compilers and preset registry

Own only profile compiler/resolver/preset files.

Responsibilities:

- Base-profile registry
- Confidence policy
- Budget tiers
- Audio compiler
- Visual compiler
- Scene/duration compiler
- Thumbnail compiler
- Locale compiler
- Override merger
- Capability normalization
- Final resolved-config validation
- Unit tests

Must not edit CLI/API/workflow integration files.

### Agent D — Pipeline, CLI/API, workflow, observability integration

Own only agreed integration files.

Responsibilities:

- Genre registration
- Episode/workflow orchestration
- Profile preview
- Profile persistence consumption
- CLI/API support
- Workflow-log entries
- Metrics/logging/tracing
- Resume behavior
- Downstream audio/image/video/thumbnail wiring
- Integration tests

Must not redefine domain contracts.

## Phase 3 — Coordinator merge and conflict review

The coordinator must:

- Review all agent changes
- Resolve integration mismatches
- Remove duplicate abstractions
- Ensure imports and package boundaries are correct
- Ensure no agent bypassed the trust boundary
- Ensure existing genres remain unchanged or intentionally adapted
- Run formatting, linting, type checking, and targeted tests

Do not accept a sub-agent's completion claim without inspecting its diff and running its tests.

## Phase 4 — Parallel review agents

After implementation is integrated, run focused reviews in parallel where supported.

### Review 1 — Architecture and duplication

Check:

- Separation of creative intent and executable config
- Reuse of existing abstractions
- No duplicate OpenAI/TTS/image clients
- No oversized god service
- No cyclic dependencies
- No hidden coupling to one genre

### Review 2 — Security and reliability

Check:

- Untrusted model output handling
- Prompt injection
- Input limits
- Secret/PII logging
- Concurrency/idempotency
- Atomic persistence
- Timeout/retry behavior
- Safe fallback
- Voice authorization boundary

### Review 3 — Type safety and test quality

Check:

- Unsafe casts
- `any`
- Non-exhaustive switches
- Schema/type drift
- Missing negative tests
- Brittle snapshots
- Missing regression coverage

### Review 4 — Operations and UX

Check:

- CLI/API usability
- Workflow resume
- Actionable diagnostics
- Metrics cardinality
- Artifact discoverability
- Documentation completeness

Fix all material findings before final verification.

---

# File ownership rules

Before spawning implementation agents, produce a concrete ownership table based on actual repository paths.

Rules:

- One active writer per file.
- Shared contract files are frozen before parallel implementation.
- Agents may read any file.
- Agents may not reformat unrelated files.
- Agents may not move or rename shared modules without coordinator approval.
- Agents must report files changed and tests run.
- Coordinator owns final integration files if ownership is ambiguous.
- If repository tooling supports worktrees, use isolated worktrees for agents.
- Otherwise enforce disjoint path ownership strictly.

---

# Quality gates

Discover and run the repository's real commands.

At minimum, run applicable versions of:

- Dependency/install integrity check
- Formatting check
- Lint
- Type checking
- Unit tests
- Contract tests
- Integration tests
- Existing genre regression tests
- Build
- CLI smoke test
- API schema/OpenAPI validation
- Artifact/schema validation
- Security/static checks already present in the repository

Do not claim success if commands were not run.

Do not modify tests merely to suppress legitimate failures.

If unrelated pre-existing failures exist:

- Prove they pre-existed where possible
- Separate them from introduced failures
- Do not hide them
- Still run the narrowest relevant verification suite

---

# Acceptance scenarios

The implementation is complete only when all applicable scenarios pass.

## Scenario A — Supernatural suspense

Input: a dark supernatural story.

Expected:

- Horror/suspense semantic classification
- Safe horror-compatible base profile
- Dark visual intent
- Controlled sound-design intensity
- Content-rating flags
- No arbitrary provider/model/voice selection
- Persisted profile and resolved configuration

## Scenario B — Children's fable

Input: a gentle animal fable.

Expected:

- Family/children classification
- Warm visual style
- Slower, expressive narration
- Low-intensity sound design
- Conservative safety profile
- Budget limits respected

## Scenario C — Math explainer

Input: a mathematical educational explanation submitted through the generic genre.

Expected:

- Educational classification
- Math-compatible base profile or safe delegation
- No horror-style rendering
- Existing math narration-speed defaults are not unintentionally changed
- Board/diagram continuity is preserved when supported
- Existing dedicated Math genre remains operational

## Scenario D — Presenter/advice content

Input: a personal-development or business-advice script.

Expected:

- Presenter/advice-compatible profile
- Clean, confident narration intent
- Appropriate thumbnail strategy
- No automatic cloned-voice selection
- `veronicaBenini` genre remains a separate explicit choice

## Scenario E — Mixed genre

Input: an educational story with suspense elements.

Expected:

- Primary and secondary genre classification
- One deterministic base profile
- Controlled secondary-style influence
- No contradictory executable settings

## Scenario F — Low confidence

Input: a very short ambiguous outline.

Expected:

- Low confidence
- Warning
- Neutral or nearest-safe fallback
- Production can continue deterministically
- Workflow records degraded mode

## Scenario G — Malicious embedded instruction

Input contains instructions attempting to alter system configuration or select a provider.

Expected:

- Instructions are treated as story data
- Schema remains valid
- No provider, path, model, voice, or command injection
- Security test passes

## Scenario H — Repeated execution

Run the same content and versions twice.

Expected:

- Same cache key
- Cached profile reuse
- No unnecessary external analysis call
- Same resolved configuration hash unless an explicit non-deterministic field is documented and excluded

---

# Implementation constraints

- Follow existing TypeScript compiler strictness.
- Prefer exhaustive discriminated unions.
- Avoid `any`.
- Avoid unchecked type assertions.
- Avoid duplicate enum definitions.
- Keep external DTOs separate from trusted domain objects.
- Keep I/O at application boundaries.
- Use dependency injection according to repository conventions.
- Do not introduce a large framework solely for this feature.
- Do not hard-code provider-specific options into domain models.
- Do not perform external network calls in default tests.
- Do not expose secrets or full content in logs.
- Do not automatically publish content merely because analysis completed.
- Do not alter existing voice speed or renderer defaults outside the generic-genre path unless a shared bug is proven and regression-tested.
- Do not leave TODO-only placeholders for core behavior.
- Do not mark incomplete work as complete.

---

# Required final deliverables

Complete all implementation work and provide a final report containing:

1. Architecture implemented
2. Repository components reused
3. New modules and their responsibilities
4. Multi-agent ownership and completed work
5. Trust-boundary enforcement
6. Schema and artifact versions
7. CLI/API usage examples
8. Workflow behavior
9. Cache and invalidation behavior
10. Fallback behavior
11. Existing-genre compatibility result
12. Security findings and fixes
13. Tests added
14. Exact commands run
15. Results of each quality gate
16. Remaining risks
17. Any operator decisions still required
18. Recommended next follow-up task

Also update the repository's AI/content pack or implementation-status documentation if such a mechanism already exists, so a later ChatGPT or Codex session can understand:

- What was implemented
- Where it lives
- Which decisions were made
- Which schemas and versions are current
- Which commands verify the feature
- Which work remains

---

# Start now

Begin by reading repository instructions and mapping the existing architecture.

Then create the contract freeze and ownership map, spawn safe parallel agents, implement the feature, integrate it, review it, fix findings, and run all quality gates.

Do not stop after planning.
