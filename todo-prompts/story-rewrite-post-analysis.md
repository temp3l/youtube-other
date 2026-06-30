You are planning a production-grade implementation for the existing YouTube story-generation repository.

Read and follow all repository instructions first, especially:

* `AGENTS.md`
* nested `AGENTS.md` files
* existing architecture and naming conventions
* current CLI command patterns
* story persistence, inspection, status, cache, resume, fingerprint, telemetry, and validation infrastructure
* approved plans under `docs/plans/`
* relevant completed work from Tasks 07–16

Do not implement anything in this turn. Produce a detailed implementation plan only.

## Objective

Add an on-demand OpenAI-based quality-analysis stage for rewritten stories.

The feature must:

1. Analyze rewritten full stories for YouTube production quality.
2. Produce a complete, structured report.
3. Validate the story against a deterministic production gate.
4. Finish with:

   * `pass: true | false`
   * one explicit production verdict
5. Persist the analysis in the correct story artifact location.
6. Integrate the persisted result into existing `inspect` and `status` commands.
7. Support explicit execution through a CLI command.
8. Be resumable, fingerprinted, cache-aware, observable, and safe to rerun.
9. Avoid silently analyzing stale or mismatched story content.

## First inspect the repository

Before proposing the design, identify:

* the current CLI entry point and command hierarchy
* existing story generation, validation, metadata, audio, render, inspect, and status commands
* canonical paths for:

  * original source stories
  * cleaned source stories
  * canonical English full stories
  * localized full stories
  * short stories
  * validation results
  * metadata
  * execution reports
* current artifact manifest, sidecar, cache, resume, fingerprint, and invalidation patterns
* existing OpenAI client abstractions
* existing structured-output helpers
* current pricing, usage, telemetry, retry, and rate-limit handling
* existing schema-validation library and conventions
* current definition of story readiness or pipeline completion
* whether `inspect` and `status` already aggregate stage-specific artifacts
* whether stories are addressed by episode, locale, format, or artifact path
* how errors and non-zero exit codes are represented
* current tests for CLI output, persisted artifacts, resume behavior, and status aggregation

Do not invent a parallel architecture where an existing abstraction can be extended.

## Proposed CLI behavior

Plan an explicit on-demand command following existing CLI conventions.

Prefer a command shape similar to:

```bash
node apps/cli/dist/index.js story analyze \
  --episode 014-hachishakusama-the-eight-foot-woman \
  --locale en \
  --format full
```

The final command name and flags must follow the repository’s current command hierarchy. If a better existing namespace exists, use it and explain why.

Plan useful options where consistent with current CLI conventions:

```text
--episode <slug>
--locale <locale>
--format full
--force
--refresh
--verbose
--json
--model <model>
--reasoning-effort <low|medium|high>
```

Do not add flags that duplicate existing global CLI behavior.

The command must analyze only persisted rewritten story artifacts. It must not regenerate or modify the story.

By default, target:

```text
model: gpt-5.4-mini
reasoning effort: medium
```

Model and reasoning configuration must use the repository’s centralized configuration system rather than hard-coded values where such a system exists.

## Required terminal report

The normal human-readable CLI output must include:

```text
Story Production Analysis
Episode: 014-hachishakusama-the-eight-foot-woman
Locale: en
Format: full
Model: gpt-5.4-mini
Reasoning: medium

Overall score: 82/100
Pass: true
Verdict: READY_WITH_MINOR_EDITS
Meaning: wording, pacing, or narration cleanup only
```

It must print all category scores, production-gate checks, strengths, weaknesses, blocking issues, required changes, optional improvements, narration assessment, visual-production assessment, and final verdict.

The command must end with an unambiguous summary containing:

```text
pass: true
verdict: READY_WITH_MINOR_EDITS
```

or:

```text
pass: false
verdict: REVISION_REQUIRED
```

For `--json`, print a stable machine-readable result without mixing human-readable text into stdout. Route diagnostics appropriately according to existing repository conventions.

## Verdicts

The analysis must return exactly one of these verdicts:

```text
READY
READY_WITH_MINOR_EDITS
REVISION_REQUIRED
REWRITE_REQUIRED
BLOCKED
```

The human-readable report must explain them as:

```text
READY — publishable without meaningful changes

READY_WITH_MINOR_EDITS — wording, pacing, or narration cleanup only

REVISION_REQUIRED — structural weaknesses affect retention or clarity

REWRITE_REQUIRED — weak hook, broken logic, poor payoff, or unsuitable production structure

BLOCKED — safety, copyright, provenance, or policy problem
```

Persist the canonical enum value separately from the display description.

## Analysis categories

Plan a strongly typed structured-output schema covering at least:

```text
hookStrength
retentionAndPacing
narrativeClarity
tensionAndEscalation
emotionalImpact
narrationQuality
visualSuitability
sceneAlignment
originality
characterCredibility
climaxAndEnding
localizationQuality
monetizationSafety
thumbnailPotential
```

Scores should use a documented fixed range, preferably `0–10`.

The report must also contain:

```text
overallScore
pass
verdict
verdictReason
strengths
weaknesses
blockingIssues
retentionRisks
requiredChanges
optionalImprovements
productionAssessment
gateResults
```

Suggested production assessment fields:

```text
estimatedNarrationMinutes
estimatedSceneCount
visuallyDistinctSceneCount
repeatedVisualRisk
characterContinuityRisk
thumbnailConcept
thumbnailHook
```

Each significant criticism should include precise evidence, preferably paragraph numbers or stable section references rather than large copied excerpts.

## Production gate

Implement the production gate deterministically in application code.

Do not let the model decide `pass` independently.

The OpenAI response should provide evidence and category scores. Application code must calculate the final gate result and validate the verdict.

Use these minimum thresholds:

```text
hookStrength >= 7
retentionAndPacing >= 7
narrativeClarity >= 8
climaxAndEnding >= 7
visualSuitability >= 7
overallScore >= 75
```

The story must also fail when any of these are true:

```text
- unresolved narrative contradiction
- unresolved timeline or causal inconsistency
- monetization or publishing blocking issue
- copyright or provenance blocking issue
- localized story changes plot-critical facts, relationships, threat rules, climax, or ending
- required source lineage is missing or stale
- analysis does not match the current story fingerprint
- structured analysis is incomplete or invalid
```

Plan a typed gate representation such as:

```ts
interface ProductionGateResult {
  pass: boolean;
  checks: ProductionGateCheck[];
  failedChecks: ProductionGateCheck[];
}
```

Each check should contain:

```text
id
label
actual
expected
pass
severity
reason
```

## Verdict derivation

Plan deterministic rules that reconcile model findings with the production gate.

At minimum:

```text
BLOCKED
- any safety, copyright, provenance, source-lineage, or publishing blocker

REWRITE_REQUIRED
- severe structural failure
- broken core logic
- unusable climax or ending
- story unsuitable for visual production
- multiple major gate failures requiring substantial reconstruction

REVISION_REQUIRED
- one or more production-gate failures that can be repaired without replacing the entire story

READY_WITH_MINOR_EDITS
- all hard gates pass
- only non-blocking wording, pacing, pronunciation, or narration cleanup remains

READY
- all gates pass
- no meaningful required changes remain
```

The plan must state whether the model proposes a verdict that is then normalized by deterministic code, or whether deterministic application logic derives the verdict entirely from structured findings. Prefer deterministic final classification where feasible.

`pass` must normally be:

```text
true:
- READY
- READY_WITH_MINOR_EDITS

false:
- REVISION_REQUIRED
- REWRITE_REQUIRED
- BLOCKED
```

Document any justified exception, but avoid exceptions unless the existing architecture requires one.

## Persistence

Determine the correct artifact location from the existing repository architecture.

Prefer a locale- and format-specific persisted artifact associated with the exact rewritten story, for example conceptually:

```text
episodes/<episode>/<locale>/full/analysis/story-production-analysis.json
```

Do not use this path blindly if the repository already has a canonical validation, reports, metadata, or stage-output directory.

The persisted artifact should include at least:

```text
schemaVersion
episode
locale
format
sourceArtifactPath
sourceContentFingerprint
sourceLineageFingerprint
analysisPromptVersion
analysisSchemaVersion
productionGateVersion
model
reasoningEffort
createdAt
updatedAt
usage
estimatedCost
scores
overallScore
gateResults
pass
verdict
verdictReason
strengths
weaknesses
blockingIssues
retentionRisks
requiredChanges
optionalImprovements
productionAssessment
```

Use atomic writes.

Do not persist hidden chain-of-thought or raw internal reasoning.

Persist only structured conclusions, concise evidence, usage data, and operational metadata.

## Fingerprints, cache, resume, and invalidation

The plan must define a stable analysis fingerprint derived from all relevant inputs, including:

```text
rewritten story content fingerprint
locale
format
analysis prompt version
analysis schema version
production gate version
model
reasoning effort
relevant source-lineage fingerprint
```

Expected behavior:

```text
- same valid fingerprint: reuse persisted result
- story content changed: invalidate and rerun
- prompt/schema/gate version changed: invalidate and rerun
- model/reasoning changed: invalidate unless repository policy explicitly permits reuse
- invalid or partial artifact: reject and regenerate
- --force or equivalent: rerun regardless of cache
```

Ensure the plan aligns with the persistence and invalidation architecture introduced by the existing cost-control and resume tasks.

## OpenAI interaction

Use structured output with a strict schema.

The prompt should instruct the model to:

* evaluate the supplied story only
* avoid rewriting the story
* avoid inventing missing facts
* distinguish blocking issues from optional improvements
* cite paragraph or section references
* assess spoken narration, not only written prose
* assess visual production feasibility
* identify repetition versus genuine escalation
* detect generic AI-writing patterns
* detect contradictions and implausible character behavior
* evaluate climax and final payoff
* evaluate localization fidelity when a canonical source is available
* report policy, copyright, and provenance concerns conservatively
* return valid structured data only

Plan validation for:

* malformed responses
* out-of-range scores
* missing categories
* contradictory findings
* invalid verdict values
* impossible duration or scene estimates
* excessive evidence excerpts
* model refusal
* timeout
* transient API failure
* permanent API failure

Reuse existing retries and error classification.

Do not automatically rewrite a failed story as part of this command.

## Cost and observability

Integrate with existing usage and pricing infrastructure.

Capture:

```text
model
reasoning effort
input tokens
output tokens
reasoning tokens when exposed
cached tokens when exposed
estimated cost
request duration
retry count
cache hit or miss
analysis fingerprint
execution ID
```

Ensure logs do not contain the complete story unless the repository already permits this at an appropriate secure log level.

The command should participate in existing execution reporting and exit-code behavior.

Plan whether `pass: false` should produce a non-zero exit code. Recommended behavior:

```text
0: analysis completed and production gate passed
1: analysis completed but production gate failed
2 or existing equivalent: operational/configuration/schema/API failure
```

Use the repository’s established exit-code conventions if different.

## Inspect integration

Update the existing inspect command so it can display the latest persisted story-analysis result.

It should expose at least:

```text
analysis present: yes|no
analysis current: yes|no
analysis fingerprint matches: yes|no
pass: true|false
verdict
overall score
failed production gates
blocking issue count
required change count
model
reasoning effort
analyzed at
estimated cost
```

When stale, inspect must clearly distinguish:

```text
analysis exists
analysis is stale
analysis does not apply to the current rewritten story
```

Inspect must not present a stale result as valid.

## Status integration

Update the existing status command so production readiness incorporates the persisted analysis.

Plan explicit state behavior, such as:

```text
NOT_ANALYZED
ANALYSIS_STALE
ANALYSIS_FAILED
BLOCKED
REWRITE_REQUIRED
REVISION_REQUIRED
READY_WITH_MINOR_EDITS
READY
```

Use existing status enums and stage-state patterns where possible rather than adding a conflicting parallel status model.

Status must include:

```text
pass
verdict
current/stale state
failed gate count
blocking issue count
```

Define whether downstream metadata, audio, render, or publish stages should be blocked when `pass === false`.

Recommended default:

```text
- analysis remains explicitly on-demand unless current pipeline policy requires automatic execution
- publishing readiness must be false when analysis is missing, stale, invalid, or failed
- render and audio behavior should not be changed silently without an approved dependency rule
```

Clearly identify any existing commands whose semantics would change.

## Validation and security

Plan protections against:

* prompt injection embedded in story text
* story text being interpreted as system instructions
* malicious or malformed persisted analysis artifacts
* path traversal through episode or locale parameters
* oversized story inputs
* unsupported locales or formats
* accidental analysis of short content when only full stories are supported
* logging sensitive source material
* using stale canonical-source comparisons
* untrusted model output controlling filesystem paths or command execution

The story must be enclosed and treated strictly as untrusted content.

## Tests

Plan comprehensive tests.

### Unit tests

Cover:

* score schema validation
* deterministic overall score calculation
* production gate threshold boundaries
* each blocking condition
* verdict derivation
* pass mapping
* fingerprint calculation
* stale-result detection
* invalid artifact rejection
* result formatting
* JSON output stability
* exit-code mapping
* cost calculation

Include exact boundary cases:

```text
hookStrength = 6.99 or integer equivalent => fail
hookStrength = 7 => pass

narrativeClarity = 7 => fail
narrativeClarity = 8 => pass

overallScore = 74 => fail
overallScore = 75 => pass
```

Adapt these examples to the chosen numeric representation.

### Integration tests

Cover:

* successful analysis and persistence
* cached rerun
* forced rerun
* story modification invalidates result
* prompt version change invalidates result
* gate version change invalidates result
* malformed OpenAI response
* transient retry
* permanent API failure
* analysis with blockers
* inspect reads current result
* inspect identifies stale result
* status incorporates current passing result
* status incorporates current failing result
* status rejects stale result
* human-readable CLI report
* JSON CLI report
* correct final `pass` and verdict output
* correct exit codes

Use mocked OpenAI responses in deterministic tests.

Add fixture coverage for at least:

```text
READY
READY_WITH_MINOR_EDITS
REVISION_REQUIRED
REWRITE_REQUIRED
BLOCKED
```

## Documentation

Plan updates for:

* CLI usage
* environment/configuration
* supported model and reasoning settings
* production-gate thresholds
* verdict definitions
* persisted artifact schema
* inspect/status integration
* cache and invalidation behavior
* exit codes
* operational cost expectations
* troubleshooting stale or invalid analyses

## Compatibility and migration

Determine whether existing story artifacts require migration.

Prefer:

```text
- optional read of absent analysis artifacts
- no destructive migration
- newly generated analysis uses only the new canonical schema
- no silent interpretation of old unrelated validation files as this analysis
```

Do not overload an existing validation artifact unless its schema and responsibility clearly match this feature.

## Deliverable

Create one implementation plan under the repository’s existing plan directory and naming convention.

The plan must include:

1. Current-state findings with exact file paths.
2. Proposed architecture.
3. CLI contract.
4. Structured analysis schema.
5. Deterministic production-gate implementation.
6. Verdict derivation rules.
7. Persistence path and schema.
8. Fingerprint, cache, resume, and invalidation behavior.
9. Inspect integration.
10. Status integration.
11. OpenAI prompt and structured-output strategy.
12. Cost and telemetry integration.
13. Error handling and exit codes.
14. Security considerations.
15. Detailed file-by-file change list.
16. Unit and integration test matrix.
17. Documentation changes.
18. Backward-compatibility considerations.
19. Ordered implementation sequence.
20. Risks, assumptions, and unresolved questions.

Resolve questions from repository evidence wherever possible. Do not leave decisions open merely because multiple implementations are possible.

End your response with:

```text
Plan created: <path>

Recommended implementation order:
1. ...
2. ...
3. ...

Key decisions:
- ...
- ...

Remaining blockers:
- none
```

Only list remaining blockers when they genuinely cannot be resolved from the repository.

