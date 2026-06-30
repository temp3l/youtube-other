# Task 19: Story Production Quality Analysis Plan

## 1. Summary

Add an explicit, on-demand OpenAI story-production analysis stage for persisted rewritten full-story artifacts. The stage will produce a structured quality report, run a deterministic production gate, persist a versioned artifact beside the target story, and expose current or stale analysis state through inspect/status surfaces.

The implementation must extend the existing story artifact, persistence, fingerprint, cache, telemetry, and CLI patterns. It must not regenerate or modify story content.

## 2. Current-State Findings

- CLI entry point is `apps/cli/src/index.ts`, using `commander` and modular command registrars.
- Story artifact commands are registered from `apps/cli/src/story-localization-commands.ts`, `apps/cli/src/story-full-rewrite-command.ts`, and `apps/cli/src/story-short-rewrite-command.ts`.
- Legacy episode workflow commands, including `episode inspect`, `episode analyze`, `episode status`, validation, review, audio, render, and media preparation wrappers, live in `apps/cli/src/episode-commands.ts`.
- Existing `episode analyze` is currently a dry-run alias for the episode preparation workflow, not a story-quality analysis command.
- Canonical English full artifacts are persisted under `episodes/<episode>/en/full/` by `packages/story-localization/src/canonical-full-story.persistence.ts`.
- Short artifacts and manifests are owned by `packages/story-localization/src/short-rewrite.persistence.ts`, `short-rewrite.schemas.ts`, and `short-rewrite.types.ts`.
- Cache key and output path helpers are in `packages/story-localization/src/story-localization-cache.ts`.
- Request fingerprint and story telemetry helpers are in `packages/story-localization/src/story-request-telemetry.ts`.
- Preflight already recognizes `semantic-validation` in `packages/story-localization/src/story-generation-preflight.ts`.
- OpenAI story client abstraction is `OpenAiStoryClient` in `packages/story-localization/src/story-localization-openai-batch.ts`, with `responses.create` and `responses.parse`.
- Structured output uses Zod and OpenAI `zodTextFormat`, as seen in `story-localization.service.ts`, `short-rewrite.service.ts`, and `packages/metadata/src/youtube-metadata.ts`.
- Pricing and execution telemetry live in `packages/observability/src/pricing.ts` and `packages/observability/src/telemetry.ts`.
- Runtime config centralizes OpenAI story, localization, short, validator, metadata, and speech model settings in `packages/config/src/index.ts`.
- Story schema and artifact ownership conventions are in `packages/story-localization/src/story-artifact-model.ts`.
- Current deterministic validation lives in `packages/story-localization/src/generated-story-validator.ts`.
- Source cleaning and provenance artifacts are owned by `packages/story-localization/src/source-cleaning.ts` and `source-cleaning-persistence.ts`.
- Current sample paths for episode `014-hachishakusama-the-eight-foot-woman`:
  - Original source: `episodes/014-hachishakusama-the-eight-foot-woman/source/source-original.md`
  - Cleaned source: `episodes/014-hachishakusama-the-eight-foot-woman/source/source-cleaned.md`
  - Canonical source copy: `episodes/014-hachishakusama-the-eight-foot-woman/source/014-hachishakusama-the-eight-foot-woman-en-full.md`
  - Canonical English full markdown: `episodes/014-hachishakusama-the-eight-foot-woman/en/full/script.md`
  - Canonical English full JSON: `episodes/014-hachishakusama-the-eight-foot-woman/en/full/canonical-full.json`
  - Localized full markdown: `episodes/014-hachishakusama-the-eight-foot-woman/de/full/script.md`
  - Short markdown convention: `episodes/<episode>/<language>/short/script.md`
  - Deterministic parser/load analysis: `episodes/014-hachishakusama-the-eight-foot-woman/en/full/analysis.json`
  - QA report: `episodes/014-hachishakusama-the-eight-foot-woman/en/full/qa-report.json`
  - Generation manifest: `episodes/014-hachishakusama-the-eight-foot-woman/en/full/generation-manifest.json`
  - Episode pointer: `episodes/014-hachishakusama-the-eight-foot-woman/current-artifact.json`
  - Summary manifest: `episodes/014-hachishakusama-the-eight-foot-woman/manifests/en-full.json`
- Existing `analysis.json` is deterministic parser/load analysis from the episode workflow. It must not be overloaded as the OpenAI production analysis artifact.
- Approved Tasks 07-16 establish narration-only artifacts, variant-aware validation, separated artifact owners, cost/fingerprint telemetry, and dependency-aware invalidation.

## 3. Proposed Architecture

- Add a story-production-analysis subsystem in `packages/story-localization`.
- Treat analysis as a separate persisted artifact associated with a current narration artifact.
- Support only `format=full` in v1. Reject `short` explicitly with a clear validation error.
- Analyze only persisted rewritten story artifacts:
  - `en/full/canonical-full.json` plus `en/full/script.md` for canonical English.
  - `<language>/full/script.md` plus current localized full lineage evidence where available for localized full.
- Resolve source lineage before calling OpenAI. Missing or stale lineage is a deterministic blocker and must not be silently sent for analysis as if current.
- Use OpenAI for structured evidence, scores, and advisory findings only.
- Compute final `overallScore`, production gate, `pass`, and canonical `verdict` deterministically in application code.
- Keep analysis on-demand. Do not automatically rewrite, repair, regenerate, localize, produce audio, render, or publish.

## 4. CLI Contract

Add a new command under the existing `stories` namespace:

```bash
node apps/cli/dist/index.js stories analyze \
  --episode 014-hachishakusama-the-eight-foot-woman \
  --language en \
  --format full
```

Use `stories analyze` rather than `episode analyze` because the feature targets story artifacts produced by `stories rewrite-full` and `stories rewrite-short`. Existing `episode analyze` belongs to the downstream episode preparation workflow and currently behaves as a dry-run.

Options:

- `--episode <slug-or-number>`: required target selector.
- `--language <code>`: default `en`; use existing story language normalization.
- `--format <full>`: default `full`; reject non-`full` in v1.
- `--output-root <path>`: default runtime `workspaceDir`.
- `--force`: rerun regardless of valid cached analysis.
- `--refresh`: validate cache and rerun only when missing, stale, or invalid.
- `--model <model>`: optional override.
- `--reasoning-effort <low|medium|high>`: optional override.
- `--json`: stable machine-readable stdout only.
- `--verbose`: diagnostics through existing stderr/logger conventions.

Do not add provider credential flags or flags that duplicate existing global/runtime configuration behavior.

Default model config:

- Model: `runtimeConfig.openAiValidatorModel ?? runtimeConfig.openAiStoryModel ?? "gpt-5.4-mini"`.
- Reasoning effort: `runtimeConfig.openAiValidatorReasoningEffort ?? "medium"`.
- Max output tokens: `runtimeConfig.openAiValidatorMaxOutputTokens ?? 6000`.
- If dedicated config is preferred during implementation, add `openAiStoryAnalysisModel`, `openAiStoryAnalysisReasoningEffort`, and `openAiStoryAnalysisMaxOutputTokens` to `packages/config/src/index.ts`, with `MEDIAFORGE_OPENAI_STORY_ANALYSIS_*` env names.

Human-readable output must begin with:

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

It must end with:

```text
pass: true
verdict: READY_WITH_MINOR_EDITS
```

or:

```text
pass: false
verdict: REVISION_REQUIRED
```

For `--json`, stdout must contain only JSON. Diagnostics go to stderr/logger.

Exit codes:

- `0`: analysis completed and gate passed.
- `1`: analysis completed and gate failed.
- `2`: operational, configuration, schema, or API failure unless the existing top-level handler maps errors differently.

## 5. Structured Analysis Schema

Add `packages/story-localization/src/story-production-analysis.ts`.

Constants:

- `STORY_PRODUCTION_ANALYSIS_SCHEMA_VERSION = "story-production-analysis-artifact-v1"`
- `STORY_PRODUCTION_ANALYSIS_PROMPT_VERSION = "story-production-analysis-prompt-v1"`
- `STORY_PRODUCTION_ANALYSIS_GATE_VERSION = "story-production-gate-v1"`
- `STORY_PRODUCTION_ANALYSIS_RESPONSE_SCHEMA_VERSION = "story-production-analysis-response-v1"`

Verdict enum:

- `READY`
- `READY_WITH_MINOR_EDITS`
- `REVISION_REQUIRED`
- `REWRITE_REQUIRED`
- `BLOCKED`

Verdict descriptions:

- `READY`: publishable without meaningful changes.
- `READY_WITH_MINOR_EDITS`: wording, pacing, or narration cleanup only.
- `REVISION_REQUIRED`: structural weaknesses affect retention or clarity.
- `REWRITE_REQUIRED`: weak hook, broken logic, poor payoff, or unsuitable production structure.
- `BLOCKED`: safety, copyright, provenance, or policy problem.

Model response schema:

- `scores`: fixed object with integer `0..10` fields:
  - `hookStrength`
  - `retentionAndPacing`
  - `narrativeClarity`
  - `tensionAndEscalation`
  - `emotionalImpact`
  - `narrationQuality`
  - `visualSuitability`
  - `sceneAlignment`
  - `originality`
  - `characterCredibility`
  - `climaxAndEnding`
  - `localizationQuality`
  - `monetizationSafety`
  - `thumbnailPotential`
- `overallScore`: integer `0..100`, model-proposed only.
- `findings`:
  - `unresolvedNarrativeContradiction`
  - `unresolvedTimelineOrCausalInconsistency`
  - `monetizationOrPublishingBlocker`
  - `copyrightOrProvenanceBlocker`
  - `localizedPlotCriticalChange`
  - `structuralFailureSeverity: "none" | "minor" | "major" | "severe"`
  - `visualProductionSuitability: "usable" | "limited" | "unsuitable"`
- Evidence item shape:
  - `id`
  - `paragraphRefs`
  - `sectionRefs`
  - `summary`
  - `severity: "minor" | "major" | "blocking"`
  - `evidenceNote`
- Required arrays:
  - `strengths`
  - `weaknesses`
  - `blockingIssues`
  - `retentionRisks`
  - `requiredChanges`
  - `optionalImprovements`
- `productionAssessment`:
  - `estimatedNarrationMinutes`
  - `estimatedSceneCount`
  - `visuallyDistinctSceneCount`
  - `repeatedVisualRisk: "low" | "medium" | "high"`
  - `characterContinuityRisk: "low" | "medium" | "high"`
  - `thumbnailConcept`
  - `thumbnailHook`
  - `narrationAssessment`
  - `visualProductionAssessment`
- `verdictRecommendation`: advisory model verdict enum.
- `verdictReason`

Validation rules:

- Use strict Zod schemas with no unknown keys.
- Reject missing category scores.
- Reject out-of-range scores.
- Reject missing required findings.
- Reject invalid verdict values.
- Reject impossible duration or scene estimates.
- Reject excessive evidence excerpts; evidence should be paragraph or section references plus concise notes, not copied passages.
- Reject contradictory findings, such as blocking issues without any blocking indicator.
- Reject model refusal or incomplete output as operational/schema failure unless it can be represented as a deterministic invalid-analysis blocker before persistence.

## 6. Deterministic Production Gate

Implement gate logic in application code, not in the model prompt.

Types:

```ts
interface ProductionGateResult {
  pass: boolean;
  checks: ProductionGateCheck[];
  failedChecks: ProductionGateCheck[];
}

interface ProductionGateCheck {
  id: string;
  label: string;
  actual: string | number | boolean;
  expected: string;
  pass: boolean;
  severity: "info" | "warning" | "blocking";
  reason: string;
}
```

Threshold checks:

- `hookStrength >= 7`
- `retentionAndPacing >= 7`
- `narrativeClarity >= 8`
- `climaxAndEnding >= 7`
- `visualSuitability >= 7`
- `overallScore >= 75`

Blocking checks:

- unresolved narrative contradiction
- unresolved timeline or causal inconsistency
- monetization or publishing blocker
- copyright or provenance blocker
- localized plot-critical change
- missing required source lineage
- stale required source lineage
- analysis fingerprint mismatch
- incomplete or invalid structured analysis

Overall score:

- Persist `modelOverallScore` separately.
- Compute deterministic `overallScore` from category scores.
- Initial weighting:
  - `narrativeClarity`, `retentionAndPacing`, `hookStrength`, `climaxAndEnding`, and `visualSuitability` weight `1.25`.
  - All other categories weight `1.0`.
- Convert weighted `0..10` score to rounded `0..100`.
- Gate uses deterministic `overallScore`.

## 7. Verdict Derivation Rules

Application logic derives the final canonical verdict entirely from validated structured findings and gate results. The model verdict is advisory only.

Rules:

- `BLOCKED`: any safety, copyright, provenance, source-lineage, stale-lineage, fingerprint, publishing, or invalid-analysis blocking check fails.
- `REWRITE_REQUIRED`: severe structural failure, broken core logic, unusable climax/ending, unsuitable visual production, or at least three major non-lineage production gate failures.
- `REVISION_REQUIRED`: one or more non-blocking production-gate failures that can be repaired without replacing the entire story.
- `READY_WITH_MINOR_EDITS`: all hard gates pass and only non-blocking wording, pacing, pronunciation, narration, or minor visual cleanup remains.
- `READY`: all gates pass, no blocking issues, no required changes, and no major retention risk.

Pass mapping:

- `true`: `READY`, `READY_WITH_MINOR_EDITS`
- `false`: `REVISION_REQUIRED`, `REWRITE_REQUIRED`, `BLOCKED`

No v1 exceptions.

## 8. Persistence Path And Schema

Do not overwrite `analysis.json`. Persist the canonical OpenAI production-analysis artifact at:

```text
episodes/<episode>/<language>/full/story-production-analysis.json
```

For future history, an implementation may add:

```text
episodes/<episode>/<language>/full/analysis/story-production-analysis.<fingerprint>.json
```

V1 writes only the current canonical artifact using `writeJsonAtomic`.

Artifact fields:

- `schemaVersion`
- `episode`
- `episodeSlug`
- `language`
- `locale`
- `format: "full"`
- `sourceArtifactPath`
- `sourceContentFingerprint`
- `sourceLineageFingerprint`
- `analysisFingerprint`
- `analysisPromptVersion`
- `analysisSchemaVersion`
- `analysisSchemaFingerprint`
- `productionGateVersion`
- `model`
- `reasoningEffort`
- `createdAt`
- `updatedAt`
- `executionId`
- `openAiResponseId`
- `requestDurationMs`
- `retryCount`
- `cacheStatus: "hit" | "miss" | "forced" | "stale" | "invalid"`
- `usage`
- `estimatedCost`
- `modelScores`
- `scores`
- `modelOverallScore`
- `overallScore`
- `gateResults`
- `pass`
- `verdict`
- `verdictReason`
- `modelVerdictRecommendation`
- `strengths`
- `weaknesses`
- `blockingIssues`
- `retentionRisks`
- `requiredChanges`
- `optionalImprovements`
- `productionAssessment`

Do not persist raw hidden reasoning, complete prompt payloads, or complete story text.

## 9. Fingerprint, Cache, Resume, And Invalidation

Add `computeStoryProductionAnalysisFingerprint` using `stableSerialize` and `hashText`.

Fingerprint inputs:

- rewritten story content fingerprint
- `language`
- `locale`
- `format`
- analysis prompt version
- analysis response schema version/fingerprint
- production gate version
- model
- reasoning effort
- relevant source-lineage fingerprint
- source artifact identity/path

Behavior:

- Same valid fingerprint: reuse persisted result.
- Story content changed: stale and rerun.
- Prompt/schema/gate version changed: stale and rerun.
- Model/reasoning changed: stale and rerun.
- Invalid or partial artifact: reject and regenerate when possible.
- `--force`: rerun regardless of cache.
- `--refresh`: reuse only if valid and current; otherwise rerun.

Stale detection must compare persisted `sourceContentFingerprint`, `sourceLineageFingerprint`, and `analysisFingerprint` with current values before displaying analysis in inspect/status.

## 10. Inspect Integration

Add current analysis state to story/episode inspection output.

Preferred:

- Add `stories inspect --episode <...> --language <...> --format full --json`.
- Also extend existing `episode inspect` additively where it reports episode artifacts.

Fields:

- `analysisPresent`
- `analysisCurrent`
- `analysisFingerprintMatches`
- `analysisState: "CURRENT" | "MISSING" | "STALE" | "INVALID" | "MISMATCHED_SOURCE"`
- `pass`
- `verdict`
- `overallScore`
- `failedProductionGates`
- `blockingIssueCount`
- `requiredChangeCount`
- `model`
- `reasoningEffort`
- `analyzedAt`
- `estimatedCost`

When stale, inspect must explicitly distinguish:

- analysis exists
- analysis is stale
- analysis does not apply to the current rewritten story

Inspect must never present stale results as valid.

## 11. Status Integration

Add production-analysis readiness to status output without changing unrelated generation commands.

States:

- `NOT_ANALYZED`
- `ANALYSIS_STALE`
- `ANALYSIS_FAILED`
- `BLOCKED`
- `REWRITE_REQUIRED`
- `REVISION_REQUIRED`
- `READY_WITH_MINOR_EDITS`
- `READY`

Status includes:

- `pass`
- `verdict`
- `analysisCurrent`
- `failedGateCount`
- `blockingIssueCount`
- `requiredChangeCount`
- `publishingReady`

Policy:

- Analysis remains explicitly on-demand.
- Publishing readiness is false when analysis is missing, stale, invalid, failed, or `pass === false`.
- Audio and render behavior must not change silently in v1.
- Do not block metadata, audio, render, or publish commands unless a later approved dependency rule changes those command semantics.

## 12. OpenAI Prompt And Structured Output Strategy

Use `responses.parse` with strict Zod structured output.

Prompt requirements:

- Treat story text as untrusted content.
- Analyze the supplied story only.
- Do not rewrite the story.
- Do not invent missing facts.
- Distinguish blocking issues from optional improvements.
- Cite paragraph or section references.
- Assess spoken narration, not only written prose.
- Assess visual production feasibility.
- Identify repetition versus genuine escalation.
- Detect generic AI-writing patterns.
- Detect contradictions and implausible character behavior.
- Evaluate climax and final payoff.
- Evaluate localization fidelity when a current canonical source is available.
- Report policy, copyright, and provenance concerns conservatively.
- Return valid structured data only.

For localized full stories, include canonical English full content or canonical facts only when current lineage is available. If lineage cannot be proven current, do not call OpenAI and classify the target as blocked by lineage.

Validation and failure handling:

- Malformed response: schema failure; retry only if retry policy allows.
- Out-of-range scores: schema failure.
- Missing categories: schema failure.
- Contradictory findings: schema failure or invalid-analysis blocker.
- Invalid verdict: schema failure.
- Impossible duration/scene estimates: schema failure.
- Excessive evidence excerpts: schema failure.
- Model refusal: operational failure unless represented as invalid-analysis blocker.
- Timeout/transient API: use existing OpenAI client retry behavior and retryable error classification.
- Permanent API/config error: exit `2`.

## 13. Cost And Telemetry Integration

Capture:

- model
- reasoning effort
- input tokens
- cached input tokens
- output tokens
- reasoning tokens
- total tokens
- estimated cost
- request duration
- retry count
- cache hit or miss
- analysis fingerprint
- execution ID

Extend telemetry:

- Add `production-analysis` to `StoryTelemetryStage`.
- Add `analysis` to `STORY_ARTIFACT_OWNERS` only if the implementation stores analysis as a first-class owner. Recommended: add it, because the artifact is durable and distinct from narration validation.
- Keep API operation as `text-generation`; include `stage: "production-analysis"` in details.

Do not log full story content by default. Logs should contain paths, hashes, model, status, counts, and costs only.

## 14. Error Handling And Exit Codes

Operational errors:

- Missing API key/config: exit `2`.
- Unsupported language/format: exit `2`.
- Missing persisted rewritten story: exit `2`.
- Path traversal or unsafe path: exit `2`.
- Oversized input rejected by preflight: exit `2` unless persisted as a `BLOCKED` lineage/input-size artifact by explicit implementation choice.
- Schema/API failure after retries: exit `2`.

Completed analysis:

- Gate pass: exit `0`.
- Gate fail: exit `1`.
- Cached gate pass: exit `0`.
- Cached gate fail: exit `1`.

Errors must follow existing CLI style: JSON commands emit JSON errors only if existing wrappers support that; otherwise throw and let top-level error handling set process failure.

## 15. Security Considerations

Protections:

- Validate episode and language with existing normalizers.
- Resolve all paths under `outputRoot`; reject traversal.
- Reject unsupported locales and formats.
- Enforce max input size via preflight/token estimate before OpenAI.
- Enclose story text as untrusted user content.
- Persisted model output cannot control filesystem paths, commands, or filenames.
- Evidence must use paragraph/section references and concise notes, not long excerpts.
- Strictly parse persisted analysis artifacts with Zod.
- Verify fingerprints before presenting analysis as current.
- Do not include complete source material in telemetry or default logs.
- Do not automatically rewrite failed content.

## 16. Detailed File-By-File Change List

- `packages/story-localization/src/story-production-analysis.ts`: schemas, constants, prompt builder, gate, verdict derivation, formatting helpers, fingerprint helpers.
- `packages/story-localization/src/story-production-analysis.persistence.ts`: resolve paths, read current artifact, validate current/stale state, atomic write.
- `packages/story-localization/src/story-production-analysis.service.ts`: orchestration, cache behavior, OpenAI call, usage/cost normalization.
- `packages/story-localization/src/story-request-telemetry.ts`: add `production-analysis` stage and request fingerprint support.
- `packages/story-localization/src/story-artifact-model.ts`: add `analysis` owner if the implementation chooses first-class artifact ownership.
- `packages/story-localization/src/index.ts`: export new analysis APIs.
- `packages/config/src/index.ts`: add dedicated analysis model config only if not reusing validator config.
- `apps/cli/src/story-analysis-command.ts`: CLI registration and report output.
- `apps/cli/src/story-localization-commands.ts`: register `stories analyze`; add `stories inspect/status` if implemented as story-level commands.
- `apps/cli/src/episode-commands.ts`: add analysis state to `episode inspect` and `episode status` outputs.
- `docs/architecture/story-localization.md` or another relevant doc from `docs/README.md`: document CLI, schema, cache, status, and troubleshooting.

## 17. Unit And Integration Test Matrix

Unit tests:

- Score schema validation accepts all required categories.
- Schema rejects missing scores.
- Schema rejects out-of-range scores.
- Deterministic overall score calculation.
- Gate threshold boundaries:
  - `hookStrength = 6` fails; `hookStrength = 7` passes.
  - `narrativeClarity = 7` fails; `narrativeClarity = 8` passes.
  - `overallScore = 74` fails; `overallScore = 75` passes.
- Each blocking condition fails the gate.
- Verdict derivation covers all five verdicts.
- Pass mapping matches verdict.
- Fingerprint calculation is stable.
- Fingerprint changes when story content changes.
- Fingerprint changes when prompt/schema/gate/model/reasoning changes.
- Stale result detection.
- Invalid artifact rejection.
- Human report formatting.
- JSON output stability.
- Exit-code mapping.
- Cost calculation from usage.

Integration tests with mocked OpenAI:

- Successful analysis and persistence.
- Cached rerun.
- Forced rerun.
- Story modification invalidates result.
- Prompt version change invalidates result.
- Gate version change invalidates result.
- Malformed OpenAI response.
- Transient retry.
- Permanent API failure.
- Analysis with blockers.
- Inspect reads current result.
- Inspect identifies stale result.
- Status incorporates current passing result.
- Status incorporates current failing result.
- Status rejects stale result.
- Human-readable CLI report.
- JSON CLI report.
- Correct final `pass` and `verdict` output.
- Correct exit codes.

Fixtures:

- `READY`
- `READY_WITH_MINOR_EDITS`
- `REVISION_REQUIRED`
- `REWRITE_REQUIRED`
- `BLOCKED`

Focused validation commands:

- `pnpm test:focused -- packages/story-localization/src/story-production-analysis.unit.test.ts`
- `pnpm test:focused -- apps/cli/src/story-analysis-command.unit.test.ts`
- After focused tests pass, run one affected-package typecheck.

## 18. Documentation Changes

Update relevant docs, not root `README.md`:

- CLI usage.
- Environment/configuration.
- Supported model and reasoning settings.
- Production-gate thresholds.
- Verdict definitions.
- Persisted artifact schema.
- Inspect/status integration.
- Cache and invalidation behavior.
- Exit codes.
- Operational cost expectations.
- Troubleshooting stale or invalid analyses.

## 19. Backward Compatibility

- No destructive migration.
- Missing analysis artifacts are optional reads.
- New writes use only `story-production-analysis-artifact-v1`.
- Do not interpret legacy `analysis.json`, `qa-report.json`, or generation manifests as this production analysis.
- Existing rewrite, metadata, audio, render, and upload commands continue to work.
- Publishing readiness may become stricter only where status/readiness already reports readiness, not by silently blocking unrelated commands.

## 20. Ordered Implementation Sequence

1. Add schemas, constants, gate, verdict derivation, and fingerprint helpers.
2. Add persistence, current artifact resolution, and stale detection helpers.
3. Add service orchestration with mocked OpenAI support.
4. Add CLI command and human/JSON formatters.
5. Add inspect/status aggregation.
6. Add telemetry and cost integration.
7. Add focused unit tests.
8. Add mocked integration tests.
9. Update docs.
10. Run focused validation and one affected-package typecheck.

## 21. Risks, Assumptions, And Unresolved Questions

Assumptions:

- V1 supports full stories only; short analysis is rejected.
- `stories analyze` is the canonical CLI because this is a story artifact operation.
- Final classification is deterministic; model verdict is advisory only.
- Missing or stale lineage is blocking.
- Analysis is on-demand and does not block audio/render commands in v1.

Risks:

- Localized full lineage is less directly persisted than canonical English full in the currently inspected code. Mitigation: block analysis when lineage cannot be proven current.
- Adding an `analysis` owner touches shared enum unions. Mitigation: make the enum addition additive and test owner unions.
- Status semantics may become stricter than current approval-only status. Mitigation: expose publishing readiness separately and do not block unrelated commands.
- Fingerprint churn can cause unnecessary paid reruns. Mitigation: keep fingerprint payload deterministic and scoped to true analysis dependencies.

Remaining blockers:

- none

Plan created: `docs/plans/19-story-production-analysis-plan.md`

Recommended implementation order:
1. Core schema/gate/verdict/fingerprint modules.
2. Persistence and stale detection.
3. Service plus mocked OpenAI adapter.
4. CLI command and output formatting.
5. Inspect/status integration.
6. Tests and docs.

Key decisions:
- Use `stories analyze`, not `episode analyze`.
- Persist `story-production-analysis.json`, not legacy `analysis.json`.
- Derive final `pass` and `verdict` deterministically.
- Treat missing or stale lineage as blocking.
- Keep analysis on-demand and do not silently block audio/render.

Remaining blockers:
- none
