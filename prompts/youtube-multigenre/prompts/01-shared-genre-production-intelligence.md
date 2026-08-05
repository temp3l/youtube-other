# Codex Goal 1 — Shared Genre-Aware Production Intelligence

## Objective

Extract only the genuinely reusable capabilities needed by horror and veronicaBenini into an opt-in shared foundation. Keep all creative policy genre-specific.

## Repository and compatibility rules

Inspect the repository first. Reuse existing genre profiles, workflow engine, CLI, story generation, localization, TTS providers, ElevenLabs integration, image generation, reference-image handling, story-bible handling, renderer, publishing, analytics, artifact paths, observability, caching, and tests.

Do not create parallel implementations when an existing abstraction can be extended.

Shared changes must be:
- additive;
- opt-in;
- backward compatible;
- activated only by the requesting genre profile;
- covered by characterization tests when they affect shared contracts, cache keys, prompt versions, normalizers, renderers, publishing, workflows, or artifact paths.

Preserve existing defaults and artifacts for history, math education, Dark Truth/horror, veronicaBenini, generic auto-genre, and all other genres unless the relevant profile explicitly activates the new behavior.

Never invalidate, migrate, rename, regenerate, or delete existing episodes automatically.

Use strict TypeScript, repository-standard schema validation, structured model outputs, bounded retries, deterministic validators, idempotent/resumable jobs, versioned cache keys, and production logging without secrets.

## Shared capabilities

Implement or extend reusable contracts/services for:

1. topic opportunity scoring;
2. script structure and retention analysis;
3. title/thumbnail packaging hypotheses;
4. pronunciation and speech preparation;
5. audio-quality validation;
6. asset lineage, provenance, and licensing metadata;
7. approval gates and immutable plan hashes;
8. analytics checkpoints and evidence-based improvement proposals;
9. localization eligibility and planning;
10. originality/similarity checks;
11. operator overrides with audit metadata;
12. versioned per-genre configuration.

Do not add history-specific maps, chronology rules, horror tension rules, or veronica persona rules to shared defaults.

## Required architecture

Prefer interfaces such as:

```ts
interface GenreProductionProfile {
  genreId: string;
  profileVersion: string;
  topicPolicy?: TopicOpportunityPolicy;
  scriptPolicy?: ScriptAnalysisPolicy;
  packagingPolicy?: PackagingPolicy;
  audioPolicy?: AudioQualityPolicy;
  originalityPolicy?: OriginalityPolicy;
  analyticsPolicy?: AnalyticsLearningPolicy;
  localizationPolicy?: LocalizationPolicy;
}

interface ProductionEvidence<TValue> {
  value?: TValue;
  source: "MEASURED" | "DERIVED" | "MODEL_INFERENCE" | "EDITORIAL";
  confidence: number;
  references: string[];
}
```

Adapt names to repository conventions.

Implement extension points so each genre can supply:
- schemas;
- prompt fragments;
- deterministic validators;
- thresholds;
- approval requirements;
- artifact naming;
- provider constraints.

## Shared topic scoring

Support configurable weighted factors without enforcing one universal factor list.

Requirements:
- real metrics remain distinguishable from inference;
- missing data degrades gracefully;
- no fabricated search volume;
- per-factor evidence and rationale;
- manual overrides are logged;
- profile version is persisted.

## Shared retention analysis

Provide generic concepts:
- opening hook;
- promise;
- unresolved question;
- escalation/reset beats;
- conclusion/payoff;
- next-content bridge.

Genre profiles must define their own timing ranges and valid narrative structures.

## Shared packaging experiments

Support:
- three meaningfully different title candidates;
- three meaningfully different thumbnail concepts;
- candidate IDs;
- promise-versus-content validation;
- approval before publishing changes;
- experiment tracking when YouTube integration supports it.

## Shared audio and pronunciation

Support:
- canonical provider-neutral narration;
- provider-specific pronunciation adapters;
- clipping/silence/repetition/missing-speech checks;
- loudness and duration validation;
- bounded repair/regeneration;
- voice/provider/version provenance.

Do not alter global voice speed.

## Shared provenance

For every asset/audio item support:
- generated, archival, licensed, public-domain, transformed, composited, or user-supplied;
- provider/model/version/prompt;
- source identifier and licence;
- transformation lineage;
- rendered-shot/audio-segment bindings;
- disclosure metadata.

## Shared analytics learning

Support configurable H48/D7/D28-style checkpoints, missing metrics, sample thresholds, baseline comparison, evidence-backed diagnostics, proposal approval, rollback, and profile versioning.

Never silently mutate global or genre defaults from analytics.

## Shared localization planning

Support:
- eligibility scoring;
- target-language prioritization;
- translated metadata;
- dubbing/TTS planning;
- pronunciation QA;
- cost estimates;
- approval packs;
- preservation of uncertainty, provenance, and disclosure.

## Artifacts and CLI

Reuse repository conventions. Introduce the minimum shared commands/services needed by later goals. Avoid exposing generic commands when genre-specific orchestration already exists.

## Tests

Add:
- profile isolation;
- opt-in behavior;
- no-regression characterization tests;
- versioned config/cache behavior;
- approval-hash invalidation;
- missing-data handling;
- evidence classification;
- no silent analytics mutation;
- provider-neutral speech contracts;
- provenance lineage.

## Completion report

Return only:
1. architecture reused;
2. shared components added;
3. files changed;
4. tests/results;
5. migration/compatibility notes;
6. exact command or prompt to run Goal 2.
