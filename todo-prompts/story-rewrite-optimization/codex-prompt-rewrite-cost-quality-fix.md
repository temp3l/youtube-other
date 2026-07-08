# Codex Prompt — Reduce Rewrite API Cost and Improve Story/Short Quality

You are working in the MediaForge / YouTube story pipeline codebase.

Goal:
Improve generated story quality while reducing paid OpenAI rewrite/localization/short-generation cost. The current pipeline is producing acceptable full rewrites but weak Shorts, excessive token usage, duplicate metadata, inconsistent names, and expensive calls for tasks that should be handled by cheaper validation/repair stages.

Current observed problems from Episode 025:
- Full English rewrite is structurally usable, but too abstract in places and leans on explanation phrases like “the pattern” / “the evidence” instead of concrete narrated scenes.
- English Short is not a real narrated Short. It reads like a beat outline: “At first… From that point… The first real warning… What followed…”
- Short generation changed canonical facts: the full story protagonist is `Arin Caldor`, but the Shorts output uses `Adrian Cole` / `Adrian`.
- German Short invented or changed details, such as using `Funkgerät` where the full story centers on phones/internal extensions.
- German full localization contains formatting/language defects: mixed English/German production headings, malformed words like `Servic Eingang` / `Servic eflur`, and duplicate/fallback `mediaforge:generated-full-story` metadata blocks.
- Max output token caps are far above the real target size, especially Shorts at 9000 tokens.
- The pipeline appears to accept output without enforcing narrative quality, canonical entity preservation, metadata idempotency, or “script vs outline” distinction.

Implement a production-grade fix with strong type safety, tests, and no paid provider calls in tests.

## Required implementation

### 1. Add a typed story generation contract

Introduce or update typed contracts for generated artifacts:

```ts
type StoryArtifactKind = 'full-story' | 'localized-full-story' | 'short-story';

interface StoryGenerationBudget {
  readonly targetWordsMin: number;
  readonly targetWordsMax: number;
  readonly maxOutputTokens: number;
  readonly reasoningEffort: 'low' | 'medium' | 'high';
}

interface CanonicalStoryFacts {
  readonly episodeNumber: string;
  readonly primaryTitle: string;
  readonly protagonistNames: readonly string[];
  readonly locationAnchors: readonly string[];
  readonly threatMotifs: readonly string[];
  readonly keyRules: readonly string[];
  readonly forbiddenInventions: readonly string[];
  readonly requiredFinalReveal: string;
  readonly requiredFinalLine?: string;
}

interface StoryQualityGateResult {
  readonly status: 'PASS' | 'REPAIRABLE' | 'FAIL';
  readonly score: number; // 0-100
  readonly findings: readonly StoryQualityFinding[];
  readonly repairInstructions?: string;
}

interface StoryQualityFinding {
  readonly severity: 'error' | 'warning';
  readonly code:
    | 'OUTLINE_NOT_NARRATION'
    | 'CANONICAL_ENTITY_CHANGED'
    | 'INVENTED_CORE_DETAIL'
    | 'WORD_COUNT_OUT_OF_RANGE'
    | 'DUPLICATE_METADATA'
    | 'MIXED_LANGUAGE_HEADING'
    | 'MALFORMED_LOCALIZED_TERM'
    | 'MISSING_FINAL_STING'
    | 'EXCESSIVE_ABSTRACTION'
    | 'TOKEN_BUDGET_TOO_HIGH';
  readonly message: string;
  readonly evidence?: string;
}
```

Adapt names to existing project conventions if equivalent types already exist. Prefer readonly objects, discriminated unions, narrow literal types, and explicit return types.

### 2. Add a canonical facts extraction stage

Before localization or Shorts generation, derive a compact `CanonicalStoryFacts` object from the approved English full story.

Requirements:
- Use deterministic parsing where possible.
- Use the validator/mini model only if deterministic extraction cannot confidently identify required anchors.
- Persist facts next to the episode output, for example:
  - `episodes/<slug>/story-facts.json`
  - or the existing manifest store if the project already has a typed workflow manifest.
- The facts file must become the input contract for localization and Shorts.
- Do not send the entire full story to expensive models when a compact facts object plus selected excerpts is sufficient.

For Episode 025, the facts extraction should preserve:
- protagonist: `Arin Caldor`
- location: condemned office/shopping-center service area/backrooms
- motifs: fluorescent buzzing, wet carpet footsteps, distant/internal office phone
- rule: the rooms copy expectation / the place must not choose the destination
- red door
- final reveal: new underground level labelled `Arin Caldor`
- final sting: Arin’s phone still rings from an internal extension; caller asks which version of the red door he used
- forbidden inventions: `Adrian`, `Adrian Cole`, `Funkgerät`, unrelated radio-device mechanics

### 3. Fix Shorts generation

Replace the current Shorts prompt behavior with a strict narrative script generator.

Requirements:
- Shorts output must be a complete narrated micro-story, not a summary or outline.
- It must start with the first impossible detail in sentence 1.
- It must preserve canonical names and concrete facts from `CanonicalStoryFacts`.
- It must include exactly one central rule/threat mechanic and one final sting.
- It must avoid generic outline transitions.

Ban or heavily penalize phrases like:
- `At first`
- `From that point`
- `The first real warning came`
- `What followed changed`
- `The danger then became`
- `A reasonable attempt`
- `The final piece of evidence`
- `The apparent ending`
- `The story remains disturbing`
- German equivalents like `Zuerst`, `Von da an`, `Die erste echte Warnung`, `Was danach geschah`, `Die Geschichte bleibt verstörend`

Target Shorts budgets:
- English Short: 150-170 words
- German Short: 155-180 words
- Other localized Shorts: configure per language if existing config supports it
- Max output tokens for Shorts should default to 900-1200, not 9000

The prompt sent to the model should explicitly say:
- “Write only the narration script body and metadata requested by the renderer.”
- “Do not describe story structure.”
- “Do not say what the story does; tell the story.”
- “Do not change canonical names, devices, locations, motifs, or final reveal.”
- “Do not invent new evidence devices unless present in facts.”

### 4. Add quality gates before accepting generated text

Add a post-generation validator for full, localized full, and Shorts artifacts.

The validator should check deterministically first:
- word count bounds
- no duplicate `mediaforge:generated-full-story` blocks
- no duplicate metadata blocks
- expected heading for target language
- no banned outline phrases in Shorts
- protagonist names preserved
- forbidden inventions absent
- final sting present
- no malformed localization fragments like `Servic Eingang` / `Servic eflur`

Then optionally call the validator model only for semantic issues:
- excessive abstraction
- weak final reveal
- not story-like enough
- localization meaning drift

Acceptance rules:
- `PASS`: write artifact.
- `REPAIRABLE`: perform one targeted repair call using the cheapest configured repair/validator model and pass only the failing segment plus precise repair instructions.
- `FAIL`: do not write artifact unless explicitly forced. Save a failure report and keep the previous accepted artifact if available.

### 5. Implement targeted repairs instead of full regeneration

When only one issue fails, do not regenerate the entire story.

Examples:
- If Shorts changed `Arin Caldor` to `Adrian Cole`, repair only the script body.
- If German full has `Servic Eingang`, repair localized typography/compound words only.
- If duplicate metadata exists, fix deterministically without an API call.
- If final sting is missing, repair the last 1-2 paragraphs only.

Add a typed `RepairScope`:
```ts
type RepairScope =
  | { readonly kind: 'script-body' }
  | { readonly kind: 'metadata' }
  | { readonly kind: 'paragraph-range'; readonly startIndex: number; readonly endIndex: number }
  | { readonly kind: 'short-script' };
```

### 6. Reduce default model/cost settings

Update configuration parsing and documentation so defaults are cost-safe.

Recommended defaults, assuming these model names exist in this project:

```env
# Canonical English rewrite: use expensive model only for full creative rewrite
MEDIAFORGE_OPENAI_STORY_MODEL=gpt-5.5
MEDIAFORGE_OPENAI_STORY_REASONING_EFFORT=medium
MEDIAFORGE_OPENAI_STORY_MAX_OUTPUT_TOKENS=5500

# Localized full stories: translation/localization should not need the most expensive model by default
MEDIAFORGE_OPENAI_LOCALIZATION_MODEL=gpt-5.4-medium
MEDIAFORGE_OPENAI_LOCALIZATION_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_LOCALIZATION_MAX_OUTPUT_TOKENS=5200

# Shorts: generate from compact facts + selected excerpts, not full source
MEDIAFORGE_OPENAI_SHORT_MODEL=gpt-5.4-medium
MEDIAFORGE_OPENAI_SHORT_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_SHORT_MAX_OUTPUT_TOKENS=1200

# Validation and targeted repairs
MEDIAFORGE_OPENAI_VALIDATOR_MODEL=gpt-5.4-mini
MEDIAFORGE_OPENAI_VALIDATOR_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_VALIDATOR_MAX_OUTPUT_TOKENS=2500

# Metadata
MEDIAFORGE_OPENAI_METADATA_MODEL=gpt-5.4-mini
MEDIAFORGE_OPENAI_METADATA_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_METADATA_MAX_OUTPUT_TOKENS=1200
```

Also add config warnings:
- warn if Short max output tokens > 2000
- warn if localization model equals the full creative story model
- warn if full story max output tokens > 7000 for a target below 2000 words
- warn if validator max output tokens > 3000
- include actual model, reasoning effort, max output tokens, estimated target word bounds, and whether a repair call was used in generation reports

Do not silently change user-provided env values at runtime. Surface warnings and document recommended defaults.

### 7. Fix metadata idempotency

Ensure story generation writes exactly one metadata block and one `mediaforge` generated marker per artifact.

Requirements:
- Re-running generation must replace the previous generated block, not append another block.
- Do not append fallback “Narration-only compatibility rendering” metadata to a valid generated full story.
- Preserve canonical metadata fields from the accepted story.
- Add regression tests using a fixture with duplicate generated blocks.

### 8. Add tests with fixtures based on Episode 025 failures

Create fixtures representing:
1. Good full English story with `Arin Caldor`.
2. Bad English Short that reads like an outline and changes `Arin Caldor` to `Adrian Cole`.
3. Bad German Short that invents `Funkgerät`.
4. German full story with malformed `Servic Eingang` / `Servic eflur`.
5. German full story with duplicate `mediaforge:generated-full-story` metadata.

Tests must assert:
- bad Shorts are rejected or repaired
- canonical names are preserved
- forbidden inventions are detected
- duplicate metadata is removed deterministically
- output token budget warnings fire
- no paid provider/network calls happen in tests
- reports include quality gate status and cost-relevant settings

### 9. Improve reporting

For every generation run, write or update a report under the existing reports convention.

Report should include:
- artifact kind
- language
- model
- reasoning effort
- max output tokens
- input mode: `full-source` vs `facts+excerpts`
- approximate input/output size
- quality gate status
- repair count
- deterministic fixes applied
- rejected reasons if not accepted
- output path

### 10. Verification commands

Before finishing, run the project’s relevant checks. Prefer existing package scripts. At minimum:
- typecheck
- unit tests for story generation/quality gate/config
- lint if available
- any existing `episode validate`, `stories rewrite-short`, or dry-run provider tests if available

Do not use paid API calls during verification. Mock or dry-run providers only.

## Deliverables

- Code changes implementing the above.
- Tests and fixtures for the observed failures.
- Documentation update for cost-safe rewrite/localization/Shorts settings.
- A concise implementation report listing changed files, checks run, and remaining risks.

## Non-goals

- Do not rewrite the whole story pipeline unnecessarily.
- Do not change image generation, TTS, or rendering behavior unless required by the story artifact contract.
- Do not make real OpenAI calls in tests.
- Do not remove existing CLI compatibility unless tests prove the replacement path is safe.
