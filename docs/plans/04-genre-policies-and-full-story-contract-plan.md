# Genre Policies And Full Story Contract Plan

## resolve

Resolve the three documented uncertainties during repository inspection before editing:

1. Search for persisted StoryIR artifacts outside tests. Add versioned compatibility reads only if such artifacts actually exist.
2. Inspect all current adapters for formal placeholder threat descriptions and define exact handling from repository evidence.
3. Preserve StoryIR.climax for compatibility unless repository-wide usage proves renaming safe. Prefer mapping StoryIR.climax to FullStoryContract.narrativeCulmination.

## 1. Summary

Task 04 remains additive. It adds a centralized typed genre-policy model, deterministic policy lookup, policy-compatibility validation, a compact full-story contract derived only from validated StoryIR, focused deterministic serialization and hashing, unit and regression tests, and documentation.

Task 04 does not rewire production generation. Prompt builders, provider requests, CLI flows, persisted artifacts, cache/resume behavior, and batch behavior remain unchanged. Task 05 owns full-story prompt compilation. Task 09 owns short adaptation contracts.

## 2. Scope And Non-Goals

Included:

- typed canonical taxonomy for genre, fictionality, narrative mode, and policy rule IDs;
- backward-compatible StoryIR extension where needed for Task 04 deterministic checks;
- declarative genre-policy registry and separate compatibility validator;
- compact full-story contract schemas and builder;
- effective generation-boundary resolution before Task 05;
- stable serializer, content hashes, build fingerprinting, and lineage envelope;
- focused unit tests and documentation.

Excluded:

- full-story prompt compiler or prompt-module rendering;
- prompt text changes;
- provider request construction or model calls;
- prompt-builder wiring to the new contract;
- persistence of contracts;
- short adaptation contracts;
- repair/regeneration routing;
- validation architecture beyond the Task 04 scope;
- metadata, audio, visual, render, publication, cache, resume, telemetry, cost, or artifact-path redesign.

## 3. Repository Grounding

Inspected repository sources:

- `packages/story-localization/src/story-artifact-model.ts`
- `packages/story-localization/src/story-artifact-model.unit.test.ts`
- `packages/story-localization/src/source-cleaning.ts`
- `packages/story-localization/src/source-cleaning-persistence.ts`
- `packages/story-localization/src/source-cleaning.unit.test.ts`
- `packages/story-localization/src/canonical-facts.service.ts`
- `packages/story-localization/src/story-production.ts`
- `packages/story-localization/src/story-localization.types.ts`
- `packages/story-localization/src/story-localization.schemas.ts`
- `packages/story-localization/src/generated-story-validator.ts`
- `packages/story-localization/src/localization-prompt-builder.ts`
- `packages/story-localization/src/short-rewrite.prompt.ts`
- `packages/story-localization/src/multilingual-story-localization-settings.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/story-localization/src/index.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/episode-filesystem.ts`
- `apps/cli/src/story-full-rewrite-command.ts`
- `apps/cli/src/story-short-rewrite-command.ts`
- `docs/architecture/story-localization.md`
- `docs/plans/03-source-cleaning-and-provenance-plan.md`
- `docs/plans/story-ir-and-artifact-variant-modeling-plan.md`
- `docs/plans/story-ir-and-artifact-variant-modeling.md`

Verified repository facts relevant to Task 04:

- Task 02 exists in `story-artifact-model.ts` with `StoryIR`, `storyGenreSchema`, `fictionalitySchema`, `FullStoryOutputConstraints`, adapters, and minimal issue validation.
- Task 03 exists in `source-cleaning.ts` and `source-cleaning-persistence.ts` with deterministic source cleaning, versioned reports, and original/cleaned/hash lineage.
- `rewrite-full` already disables English and localized short generation in sync mode.
- Full/localization prompt builders still consume legacy parsed source plus canonical facts plus optional production context.
- Full response schemas still include metadata/audio/thumbnail/SEO/visual output fields.
- No current centralized policy registry, compact full-story contract, or stable JSON serializer exists.

Worktree status during planning:

- no tracked production code changes were present;
- unrelated untracked files existed: `.mediaforge.sqlite-shm`, `.mediaforge.sqlite-wal`, `.trash/`.

## 4. Current Genre And Policy Behavior

| Source                           | Symbol                              | Input Shape            | Output Shape        | Deterministic | Authority         | Current Limitation                                                         |
| -------------------------------- | ----------------------------------- | ---------------------- | ------------------- | ------------- | ----------------- | -------------------------------------------------------------------------- |
| `story-artifact-model.ts`        | `storyGenreSchema`                  | string                 | enum                | yes           | schema            | includes legacy `"horror"`                                                 |
| `story-artifact-model.ts`        | `fictionalitySchema`                | string                 | enum                | yes           | schema            | no narrative-mode schema yet                                               |
| `story-artifact-model.ts`        | `buildStoryIR()`                    | legacy facts/artifacts | `StoryIR`           | yes           | adapter           | hardcodes `genre: "horror"`                                                |
| `story-artifact-model.ts`        | `inferAllowedInventionBoundaries()` | parsed disclosure      | booleans            | yes           | adapter           | only `dialogue`, `internalThoughts`, `connectiveDetails` are modeled today |
| `story-artifact-model.ts`        | `inferCentralThreat()`              | threat string          | threat object       | yes           | adapter           | supernatural tokens imply intelligent threat                               |
| `canonical-facts.service.ts`     | `summarizeThreat()`                 | narration text         | threat string       | yes           | heuristic adapter | can inject supernatural framing                                            |
| `story-production.ts`            | `buildStoryBible()`                 | parsed/facts/analysis  | prose + lists       | yes           | diagnostic only   | repeats rules/facts outside StoryIR                                        |
| `story-production.ts`            | `buildOriginalityReview()`          | parsed/facts/analysis  | prose + lists       | yes           | diagnostic only   | repeats protected details                                                  |
| `story-production.ts`            | `buildRetentionPlan()`              | parsed/bible           | beats               | yes           | diagnostic only   | repeats reveal/ending/threat                                               |
| `localization-prompt-builder.ts` | `buildLocalizationPrompt()`         | source/facts/context   | prompt strings      | mixed         | prompt-only       | injects source + facts + diagnostics together                              |
| `generated-story-validator.ts`   | full/short validators               | generated packages     | string issues       | yes           | output validation | no typed Task 04 policy issues                                             |
| `language-profiles.ts`           | `stylisticGuidance`                 | language               | locale instructions | yes           | prompt-only       | independent of genre                                                       |

Duplicated or conflicting behavior today:

- exact written-message preservation is repeated across story production context, prompt inputs, validators, and repair instructions;
- ending preservation is repeated across story bible, retention plan, preservation checklist, and validators;
- threat, reveal, and ending are repeated across facts, analysis, bible, originality review, retention plan, and prompt inputs;
- hardcoded `"horror"` conflicts with nonfiction/documentary disclosures;
- no centralized rule prevents environmental threats from being treated as intelligent;
- no distinct folklore policy exists today;
- diagnostic artifacts repeat facts and should remain non-authoritative.

Confirmed defect cases already visible in source:

- historical mystery can receive horror/supernatural treatment because Task 02 adapters hardcode `"horror"`;
- nonfiction only blocks supernatural rule usage today, not broader invention permissions;
- environment/weather can be treated as part of threat language without a typed policy boundary;
- fictional psychological stories have no explicit policy preventing supernatural rule injection;
- folklore has no separate classification/policy boundary from confirmed fact reporting.

## 5. Current Defects And Risks

Confirmed defects:

- `StoryIR` has no `narrativeMode`.
- current StoryIR invention boundaries cannot represent motive or undocumented-action permissions.
- `StoryValidationIssueCode` lacks the Task 04 issue set.
- `validateStoryIR()` covers only a small subset of required semantic checks.
- no policy registry exists.
- no full-story contract exists.
- no serializer module exists for deterministic StoryIR/contract hashing.
- full prompt/output production still mixes narration with metadata/audio/visual concerns.

Architectural risks:

- using diagnostic artifacts as a fallback source of truth would reintroduce duplication;
- inferring precise taxonomy from heuristic text would overclaim determinism;
- putting metrics inside the contract would pollute semantic hashes;
- combining policy lookup and compatibility validation would blur ownership and complicate testing.

## 6. Canonical Taxonomy

Task 04 should refine Task 02 taxonomy in `story-artifact-model.ts`, not create a parallel copy.

Canonical story genre:

- `fictional-supernatural`
- `fictional-psychological`
- `historical-mystery`
- `true-crime`
- `documentary`
- `folklore`
- `unknown`

Legacy alias handling:

- keep legacy `"horror"` readable for compatibility;
- normalize legacy `"horror"` to `unknown` unless an explicit deterministic adapter/classification rule maps it safely;
- do not silently guess a more precise genre when evidence is insufficient.

Canonical fictionality:

- `fiction`
- `nonfiction`
- `fiction-inspired-by-folklore`
- `unknown`

Backward-compatible narrative mode:

```ts
type NarrativeMode =
  | "character-led"
  | "evidence-led"
  | "first-person"
  | "documentary"
  | "unknown";
```

Migration strategy:

- newly created native StoryIR must explicitly contain `narrativeMode`;
- legacy adapters may map missing narrative mode to `"unknown"`;
- legacy parsing remains compatible;
- policy resolution treats `"unknown"` conservatively;
- no silent inference of a precise mode when structured evidence is insufficient.

Typed StoryIR invention boundaries should be extended in native StoryIR to include:

```ts
{
  dialogue: boolean;
  internalThoughts: boolean;
  connectiveDetails: boolean;
  motives: boolean;
  undocumentedActions: boolean;
}
```

Compatibility defaults:

- native new StoryIR values must explicitly provide all five fields;
- legacy adapters may supply conservative compatibility defaults;
- no builder-level silent coercion.

Preferred adapter defaults:

- nonfiction legacy inputs:
  - `dialogue: false`
  - `internalThoughts: false`
  - `connectiveDetails: true`
  - `motives: false`
  - `undocumentedActions: false`
- fiction or unknown legacy inputs:
  - preserve current legacy behavior for existing three fields;
  - default `motives` and `undocumentedActions` conservatively to `false` unless an explicit adapter path has authoritative evidence to set them `true`.

Folklore taxonomy clarification:

- `genre: "folklore"` means folklore-inspired narrative behavior;
- expected fictionality is `fiction-inspired-by-folklore`;
- documentary or historical coverage of folklore uses `documentary` or another evidence-led genre;
- folklore beliefs in nonfiction must remain attributed claims or cultural beliefs;
- `folklore + nonfiction` is not silently accepted as the normal policy combination.

## 7. Genre Policy Model

Add `packages/story-localization/src/genre-policy.ts`.

Proposed public symbols:

- `GENRE_POLICY_SCHEMA_VERSION = "genre-policy-schema-v1"`
- `GENRE_POLICY_REGISTRY_VERSION = "genre-policy-registry-v1"`
- `genrePolicyIdSchema`
- `genrePolicySchema`
- `genrePolicyRegistrySchema`
- `type GenrePolicyId`
- `type GenrePolicy`
- `type GenrePolicyRegistry`
- `type GenrePolicyResolutionResult`
- `createGenrePolicyRegistry()`
- `resolveGenrePolicy()`
- `validateGenrePolicyCompatibility()`
- `getGenrePolicy()`

Typed policy IDs:

```ts
type GenrePolicyId =
  | "genre-policy/fictional-supernatural"
  | "genre-policy/fictional-psychological"
  | "genre-policy/historical-mystery"
  | "genre-policy/true-crime"
  | "genre-policy/documentary"
  | "genre-policy/folklore"
  | "genre-policy/unknown";
```

Stable rule-ID unions:

```ts
type TensionSourceId =
  | "chronology"
  | "evidence"
  | "environment"
  | "unresolved-contradictions"
  | "rule-escalation"
  | "perception"
  | "observable-consequences";

type ProhibitedTechniqueId =
  | "invented-dialogue"
  | "invented-internal-thoughts"
  | "unsupported-motive"
  | "unsupported-certainty"
  | "new-supernatural-mechanics"
  | "intelligent-environment"
  | "fictional-climax"
  | "victim-blaming"
  | "undocumented-actions";
```

Registry immutability:

- do not expose a mutable `Map`;
- prefer `Readonly<Record<GenrePolicyId, GenrePolicy>>` inside a closure-backed registry interface;
- registry API exposes readonly lookup and iteration only;
- tests must prove callers cannot mutate the returned registry state.

Normal production behavior:

- policy is derived from normalized genre;
- explicit policy ID/version is allowed only for tests, reading an existing versioned artifact, or controlled compatibility checks;
- explicit policy selection is never a general caller override that can force incompatible policy usage.

## 8. Policy Definitions

Historical mystery policy:

- expected fictionality: `nonfiction` or `unknown`;
- allowed narrative modes: `evidence-led`, `documentary`, `unknown`;
- no invented dialogue, internal thoughts, motives, or undocumented actions;
- connective details are `qualified-only`;
- no supernatural mechanics;
- no intelligent environmental threat;
- requires confidence attribution and prohibits unsupported certainty;
- tension sources:
  - `chronology`
  - `evidence`
  - `environment`
  - `unresolved-contradictions`

Documentary policy:

- expected fictionality: `nonfiction` or `unknown`;
- allowed narrative modes: `evidence-led`, `documentary`, `unknown`;
- no invented dialogue, internal thoughts, motives, or undocumented actions;
- connective details are `qualified-only`;
- no fictional climax;
- supernatural claims allowed only as attributed belief, not source-truth fact;
- requires confidence attribution and prohibits unsupported certainty.

True-crime policy:

- expected fictionality: `nonfiction` or `unknown`;
- allowed narrative modes: `evidence-led`, `documentary`, `unknown`;
- no invented dialogue, internal thoughts, motives, or undocumented actions;
- connective details are `qualified-only`;
- legal status distinctions remain precise;
- victim-blaming is prohibited;
- requires confidence attribution and prohibits unsupported certainty.

Fictional supernatural policy:

- expected fictionality: `fiction`;
- allowed narrative modes: `character-led`, `first-person`, `unknown`;
- preserve established supernatural rules;
- preserve central threat logic and ending consequence;
- dialogue/internal thoughts/motives/undocumented actions follow StoryIR plus restrictive precedence;
- connective details may be allowed if StoryIR allows them;
- tension sources:
  - `rule-escalation`
  - `observable-consequences`
  - `environment`

Fictional psychological policy:

- expected fictionality: `fiction`;
- allowed narrative modes: `character-led`, `first-person`, `unknown`;
- no new supernatural mechanics;
- preserve ambiguity;
- do not convert uncertain perception into confirmed supernatural fact;
- tension sources:
  - `perception`
  - `observable-consequences`
  - `environment`

Folklore policy:

- expected fictionality: `fiction-inspired-by-folklore`;
- allowed narrative modes: `character-led`, `documentary`, `unknown`;
- preserve folklore conventions and rules;
- no unsupported conversion of folklore motifs into confirmed historical fact;
- documentary coverage of folklore should not use this policy;
- tension sources:
  - `rule-escalation`
  - `environment`
  - `observable-consequences`

Unknown policy:

- expected fictionality: any canonical fictionality value;
- allowed narrative modes: all canonical modes including `unknown`;
- conservative defaults;
- no new supernatural mechanics;
- no unsupported certainty;
- dialogue/internal thoughts/motives/undocumented actions follow restrictive precedence;
- emits warnings where classification remains unresolved.

## 9. Policy Resolution And Precedence

Separate policy lookup from compatibility validation.

Lookup function:

```ts
resolveGenrePolicy(input: {
  genre: StoryGenre;
  registry?: GenrePolicyRegistry;
  requestedPolicyId?: GenrePolicyId;
  requestedPolicyVersion?: string;
}): GenrePolicyResolutionResult;
```

Compatibility function:

```ts
validateGenrePolicyCompatibility(input: {
  storyIr: StoryIR;
  policy: GenrePolicy;
}): readonly StoryValidationIssue[];
```

Execution order:

1. schema-validate StoryIR;
2. apply explicit compatibility defaults in legacy adapters only;
3. run generic StoryIR semantic validation;
4. normalize classification values such as legacy `"horror"`;
5. resolve exactly one policy from normalized genre;
6. run genre-policy compatibility validation against StoryIR;
7. if no blocking issues remain, build the full-story contract;
8. compute effective generation boundaries inside the contract builder;
9. serialize and hash contract and envelope.

Precedence for effective generation boundaries:

1. immutable source truth;
2. validated StoryIR;
3. explicit invention restrictions in StoryIR;
4. genre policy;
5. full artifact constraints.

Rules:

- restrictive boundaries always win;
- source truth and explicit non-invention boundaries are never weakened;
- Task 05 receives the already-resolved effective boundaries from the contract and must not repeat conflict resolution.

## 10. Validation Ownership Table

| Layer                                 | Owns                                                                           | Examples                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema validation                     | malformed shapes, unsupported enum values, invalid word ranges, unknown fields | missing native `narrativeMode`, invalid `variant`, short-only field in full constraints                                                                         |
| Generic StoryIR semantic validation   | non-policy semantic correctness                                                | location classified as character, event classified as character, empty threat description, missing narrative culmination, missing ending consequence            |
| Genre-policy compatibility validation | classification-to-policy mismatch                                              | fictionality incompatible with genre, narrative mode incompatible with policy, nonfiction invention permissions, historical mystery with supernatural mechanics |
| Full-contract validation              | full-only contract boundary and build guarantees                               | identity variant not full, full constraints missing, contract-source-invalid, contract includes forbidden fields                                                |

Avoid duplicate ownership. A rule should live in one layer unless a later layer deliberately aggregates earlier issues without re-emitting a second copy.

## 11. Validation Issues

Use one issue collection:

```ts
issues: readonly StoryValidationIssue[];
```

Add deterministic helpers:

- `getBlockingIssues(issues)`
- `getWarnings(issues)`

Task 04 issue codes:

- `CONFLICTING_GENRE_AND_FICTIONALITY`
- `NARRATIVE_MODE_INCOMPATIBLE_WITH_GENRE`
- `SUPERNATURAL_RULE_IN_NONFICTION`
- `SUPERNATURAL_RULE_IN_HISTORICAL_MYSTERY`
- `INVENTED_DIALOGUE_ENABLED_FOR_NONFICTION`
- `INVENTED_INTERNAL_THOUGHTS_ENABLED_FOR_NONFICTION`
- `INVENTED_MOTIVE_ENABLED_FOR_NONFICTION`
- `UNDOCUMENTED_ACTIONS_ENABLED_FOR_NONFICTION`
- `ENVIRONMENTAL_THREAT_MARKED_INTELLIGENT`
- `UNKNOWN_GENRE_REQUIRES_CONSERVATIVE_POLICY`
- `GENRE_POLICY_NOT_FOUND`
- `GENRE_POLICY_VERSION_UNSUPPORTED`
- `POLICY_OVERRIDE_WEAKENS_SOURCE_BOUNDARY`
- `NARRATIVE_CULMINATION_MISSING`
- `MISSING_REQUIRED_ENDING`
- `CONTRACT_SOURCE_IR_INVALID`
- `FICTIONALITY_UNRESOLVED_FOR_EVIDENCE_LED_GENRE`
- `FULL_STORY_CONTRACT_VARIANT_MISMATCH`

Deferred from deterministic Task 04 checks because current structured evidence is insufficient unless StoryIR is extended later:

- `FOLKLORE_ASSERTED_AS_CONFIRMED_FACT`
- `UNSUPPORTED_CERTAINTY_DETECTED`
- `FIRST_PERSON_MODE_WITHOUT_NARRATOR_SUPPORT`
- belief-versus-asserted intelligent environment attribution

Task 04 must not claim deterministic correctness for those without new structured fields.

## 12. StoryIR Backward Compatibility And Native Strictness

Native schema rules:

- native StoryIR is strict and must explicitly include:
  - `genre`
  - `fictionality`
  - `narrativeMode`
  - `allowedInventionBoundaries.dialogue`
  - `allowedInventionBoundaries.internalThoughts`
  - `allowedInventionBoundaries.connectiveDetails`
  - `allowedInventionBoundaries.motives`
  - `allowedInventionBoundaries.undocumentedActions`
- malformed values are rejected, not coerced.

Compatibility rules:

- defaults belong only in explicit adapters from legacy artifacts to StoryIR;
- adapters may map missing narrative mode to `"unknown"`;
- adapters may supply conservative defaults for new invention-boundary fields;
- ambiguous classification becomes `unknown`;
- the contract builder does not mutate or repair StoryIR;
- domain conflicts return typed issues instead of throwing.

## 13. Full Story Contract Model

Add `packages/story-localization/src/full-story-contract.ts`.

Prefer a genre-neutral culmination field:

- contract field name: `narrativeCulmination`
- Task 02 `StoryIR.climax` remains the current compatibility source field unless separately renamed later.

Proposed contract body:

```ts
interface FullStoryContract {
  readonly schemaVersion: string;
  readonly contractVersion: string;
  readonly identity: StoryArtifactIdentity & { readonly variant: "full" };
  readonly classification: {
    readonly genre: StoryGenre;
    readonly fictionality: Fictionality;
    readonly narrativeMode: NarrativeMode;
    readonly genrePolicyId: GenrePolicyId;
    readonly genrePolicyVersion: string;
  };
  readonly sourceTruth: {
    readonly entities: readonly ContractEntity[];
    readonly immutableFacts: readonly ContractFact[];
    readonly chronology: readonly ContractEvent[];
    readonly centralThreat: ContractThreat;
    readonly centralRuleOrMechanism?: ContractRule;
    readonly criticalObjects: readonly ContractObject[];
    readonly writtenMessages: readonly ContractWrittenMessage[];
    readonly narrativeCulmination: string;
    readonly endingConsequence: string;
  };
  readonly generationBoundaries: {
    readonly dialogue: boolean;
    readonly internalThoughts: boolean;
    readonly connectiveDetails: "allow" | "qualified-only" | "forbid";
    readonly motives: boolean;
    readonly undocumentedActions: boolean;
    readonly qualifiedReconstruction: boolean;
    readonly requireConfidenceAttribution: boolean;
    readonly prohibitUnsupportedCertainty: boolean;
  };
  readonly derivedSourceFlags: {
    readonly hasDisputedFacts: boolean;
    readonly hasUnknownConfidenceFacts: boolean;
    readonly hasWrittenMessages: boolean;
    readonly hasCentralRuleOrMechanism: boolean;
  };
  readonly fullOutputConstraints: FullStoryOutputConstraints;
}
```

Contract exclusions:

- raw source text;
- cleaned source text;
- cleaning report;
- story analysis prose;
- story bible prose;
- originality review prose;
- retention plan prose;
- prompt wording;
- locale-writing instructions;
- metadata, titles, descriptions, tags, hashtags, thumbnail text;
- audio, narrator, sound motifs;
- scene or image instructions;
- repair history;
- provider configuration;
- model names;
- token budgets;
- persistence paths;
- build metrics.

Metrics move outside the contract body.

## 14. Effective Generation Boundaries

Task 04 contract must contain the resolved effective generation boundaries after precedence is applied.

Resolution examples:

- StoryIR says `dialogue: true`, policy forbids dialogue for nonfiction: effective boundary is `false`.
- StoryIR says `connectiveDetails: true`, policy says `qualified-only`: effective boundary is `qualified-only`.
- StoryIR says `motives: true`, evidence-led policy forbids motives: effective boundary is `false`.
- policy allows permissive detail but source restrictions are narrower: effective boundary stays restrictive.

Derived source flags remain separate from effective boundaries:

- `hasDisputedFacts` is descriptive source state;
- `requireConfidenceAttribution` is a generation boundary;
- `hasWrittenMessages` is descriptive source state;
- exact written-message preservation remains source-truth content, not a metric or prompt-only rule.

## 15. Full Story Contract Build Result

Use a strict discriminated union:

```ts
type FullStoryContractBuildResult =
  | {
      ok: true;
      contract: FullStoryContract;
      envelope: FullStoryContractEnvelope;
      policyResolution: GenrePolicyResolutionResult;
      issues: readonly StoryValidationIssue[];
      metrics: FullStoryContractBuildMetrics;
    }
  | {
      ok: false;
      issues: readonly StoryValidationIssue[];
      policyResolution?: GenrePolicyResolutionResult;
    };
```

Rules:

- success guarantees `contract` and `envelope`;
- failure never exposes a partial contract;
- warnings remain in the single `issues` collection with warning severity.

## 16. Critical Field Requirements

Threat handling:

- empty or whitespace-only `centralThreat.description`: blocking;
- known adapter placeholder text, if any is formalized during implementation: warning or blocking depending on explicit adapter mode;
- `centralThreat.type === "unknown"` with a concrete description: valid;
- `centralThreat.type === "environmental"` and `intelligent === true`: blocking.

Critical objects:

- empty `criticalObjects` is valid by default;
- do not emit a universal warning for an empty list;
- only warn if future structured StoryIR evidence proves omission deterministically.

Narrative culmination and ending:

- `narrativeCulmination` is required;
- `endingConsequence` is required;
- diagnostic artifacts must not populate either field;
- if StoryIR lacks them, contract construction returns blocking issues;
- no retention-plan inference is allowed.

## 17. Legacy Boundary And Non-Authoritative Artifacts

The contract derives only from validated StoryIR.

Existing Task 02 adapters remain the only compatibility bridge from legacy artifacts to StoryIR. Task 04 must not add direct adapters from:

- `StoryBible`
- `OriginalityReview`
- `RetentionPlan`
- generated full packages
- any other verbose diagnostic artifact

Those artifacts remain:

- diagnostic only;
- non-authoritative;
- intentionally excluded from filling missing contract fields.

## 18. Lineage, Hashing, And Fingerprints

Use explicit lineage union:

```ts
type FullStoryContractLineage =
  | {
      kind: "cleaned-source";
      originalSourceHash: string;
      cleanedSourceHash: string;
      cleanerVersion: string;
      cleaningReportVersion: string;
      storyIrHash: string;
    }
  | {
      kind: "story-ir-only";
      storyIrHash: string;
      reason: "legacy-adapter" | "test-fixture" | "lineage-unavailable";
    };
```

Distinct hash concepts:

- StoryIR content hash:
  - canonical hash of validated StoryIR content.
- Contract content hash:
  - canonical hash of the semantic full-story contract body.
- Contract build fingerprint:
  - hash over:
    - contract content hash
    - StoryIR content hash
    - contract schema version
    - contract semantic version
    - builder version
    - policy registry version
    - selected policy ID
    - selected policy version
    - optional cleaned-source hash
    - lineage structure/version fields

Do not overload one `contractHash` with both semantic content and build provenance.

## 19. Stable Serialization Module

Add `packages/story-localization/src/stable-json.ts`.

Keep it local to `story-localization`; do not move it to `packages/shared` unless broader reuse is justified later.

Responsibilities:

- deterministic object-key ordering;
- array-order preservation;
- Unicode NFC normalization;
- omission or rejection of `undefined` by explicit contract;
- rejection of non-finite numbers;
- rejection of cycles;
- consistent handling of optional fields;
- no input mutation.

Consumers:

- StoryIR content hashing;
- full-story contract content hashing;
- build fingerprint preparation.

`full-story-contract.ts` should consume `stable-json.ts`; it should not embed a generic recursive serializer.

## 20. Version Responsibilities

Define exact version meanings and bump rules:

- `schemaVersion`
  - serialized structural shape.
  - bump when the JSON field structure changes.
- `contractVersion`
  - semantic meaning of contract fields.
  - bump when the meaning or interpretation of existing contract fields changes.
- `builderVersion`
  - derivation and normalization algorithm.
  - bump when build semantics change even if schema does not.
- `policyRegistryVersion`
  - registry composition and default selection behavior.
  - bump when available policies or selection defaults change.
- `policyVersion`
  - behavior of one specific genre policy.
  - bump when that policy’s effective rules change.
- `envelopeVersion`
  - lineage/build envelope structure.
  - bump when envelope shape changes.
- `stableSerializerVersion`
  - serializer behavior affecting hashes.
  - bump when serialization rules change.

Hash and fingerprint computation must account for the version set that affects semantic or lineage identity.

## 21. FullStoryOutputConstraints

Task 02 already has discriminated full/short output constraints. Task 04 should preserve and rely on a strict full constraint schema that independently enforces:

- `variant: "full"`;
- rejection of `variant: "short"`;
- rejection of short-only fields;
- rejection of invalid word ranges;
- rejection of invalid duration/WPM values already expressible by the Task 02 schema.

The contract builder should still validate full-only usage, but misuse must already fail at the full-constraint schema layer.

## 22. Persistence Strategy

Task 04 uses the pure model/builder strategy only:

- policies;
- validators;
- contract schemas;
- deterministic serialization;
- hashing;
- tests;
- documentation.

Task 04 does not persist contracts.

Rationale:

- preserves existing artifact paths, output schemas, cache/resume behavior, and batch behavior;
- avoids premature integration before Task 05;
- keeps persistence and invalidation decisions in later tasks.

## 23. Integration Points

Add:

- `packages/story-localization/src/genre-policy.ts`
- `packages/story-localization/src/genre-policy.unit.test.ts`
- `packages/story-localization/src/full-story-contract.ts`
- `packages/story-localization/src/full-story-contract.unit.test.ts`
- `packages/story-localization/src/stable-json.ts`
- `packages/story-localization/src/stable-json.unit.test.ts`

Modify only as necessary:

- `packages/story-localization/src/story-artifact-model.ts`
- `packages/story-localization/src/story-artifact-model.unit.test.ts`
- `packages/story-localization/src/index.ts`
- `docs/architecture/story-localization.md`
- `docs/plans/04-genre-policies-and-full-story-contract-plan.md`

Keep untouched:

- prompt builders;
- provider services;
- batch services;
- CLI commands;
- persistence helpers;
- cache helpers;
- response schemas.

## 24. Tests

Policy and taxonomy tests:

- typed policy IDs;
- stable rule-ID unions;
- one policy selected for each supported canonical genre;
- explicit policy ID/version accepted only in controlled test/compatibility scenarios;
- legacy `"horror"` normalization is conservative;
- `folklore + nonfiction` is not silently accepted as the normal combination;
- `FICTIONALITY_UNRESOLVED_FOR_EVIDENCE_LED_GENRE` warning emitted for evidence-led genres with unknown fictionality;
- unknown narrative mode uses conservative policy behavior.

StoryIR compatibility tests:

- legacy StoryIR missing `narrativeMode` maps to `unknown` through adapters;
- native StoryIR missing `narrativeMode` fails schema validation;
- native StoryIR missing `motives` or `undocumentedActions` fails;
- legacy adapters provide conservative defaults for new invention-boundary fields;
- malformed values are not silently coerced.

Registry tests:

- registry is immutable to callers;
- resolver and compatibility validator are tested independently;
- callers cannot mutate registry state through exposed interfaces.

Contract-builder tests:

- effective generation boundaries are fully resolved before Task 05;
- discriminated union build result narrows correctly;
- success branch guarantees contract and envelope;
- failure branch exposes no partial contract;
- single issues collection with no accidental duplicate emission;
- metrics excluded from contract body;
- contract content hash unaffected by build metrics;
- content hash separated from build fingerprint;
- lineage union requires explicit reason when source hashes are unavailable;
- contract derived only from validated StoryIR;
- diagnostic artifacts cannot populate missing narrative culmination or ending;
- documentary fixture uses narrative culmination without fictional confrontation requirements;
- concrete unknown threat is valid;
- empty threat description fails;
- strict full constraints reject short values.

Serializer tests:

- deterministic ordering;
- array-order preservation;
- Unicode NFC normalization;
- optional field handling;
- rejection of `undefined` where not representable;
- rejection of non-finite numbers;
- rejection of cycles;
- no mutation.

Regression tests:

- historical mystery plus supernatural rule blocks;
- nonfiction plus invented dialogue blocks;
- nonfiction plus internal thoughts blocks;
- nonfiction plus motives blocks;
- nonfiction plus undocumented actions blocks;
- fictional supernatural preserves established rules;
- fictional psychological does not gain supernatural mechanics;
- folklore policy uses expected fictionality;
- evidence-led genre with unknown fictionality remains buildable under conservative warning behavior where no other blocking issues exist.

## 25. Verification

Focused commands based on actual repository scripts:

- `pnpm test:unit -- packages/story-localization/src/stable-json.unit.test.ts`
  - serializer determinism and invalid input handling.
- `pnpm test:unit -- packages/story-localization/src/genre-policy.unit.test.ts`
  - policy lookup, typed IDs, immutability, compatibility validation.
- `pnpm test:unit -- packages/story-localization/src/full-story-contract.unit.test.ts`
  - contract build result, boundaries, lineage, hashes, fingerprinting.
- `pnpm test:unit -- packages/story-localization/src/story-artifact-model.unit.test.ts`
  - Task 02 regression coverage and backward compatibility.
- `pnpm test:unit -- packages/story-localization/src/source-cleaning.unit.test.ts`
  - Task 03 cleaner regression coverage.
- `pnpm test:unit -- packages/story-localization/src/story-localization.unit.test.ts packages/story-localization/src/short-rewrite.unit.test.ts`
  - existing story-localization and short behavior unchanged.
- `pnpm test:unit -- packages/story-localization/src/stable-json.unit.test.ts packages/story-localization/src/genre-policy.unit.test.ts packages/story-localization/src/full-story-contract.unit.test.ts packages/story-localization/src/story-artifact-model.unit.test.ts`
  - new Task 04 unit tests together, to catch registry shared-state or mutation bugs.
- `pnpm --filter @mediaforge/story-localization typecheck`
  - package typecheck.
- `pnpm --filter @mediaforge/cli typecheck`
  - CLI consumer typecheck.
- `rg -n "stableSerialize|GenrePolicyId|resolveGenrePolicy|validateGenrePolicyCompatibility|FullStoryContractBuildResult" packages/story-localization/src docs`
  - symbol and documentation presence.
- `rg -n "FullStoryContract|GenrePolicy|stable-json" packages/story-localization/src/localization-prompt-builder.ts packages/story-localization/src/short-rewrite.prompt.ts packages/story-localization/src/story-localization.service.ts packages/story-localization/src/story-localization-batch-service.ts apps/cli/src`
  - verify prompt builders, provider services, batch services, and CLI remain untouched.

Narrow lint/format checks:

- repository has `lint` and `format`, but no narrow dedicated scripts were found;
- do not default to running broad repo-wide `pnpm lint` or `pnpm format` for Task 04 planning or targeted implementation unless a later implementation actually touches code and narrower checks are unavailable.

## 26. Implementation Sequence

1. Extend Task 02 model in `story-artifact-model.ts`.
   - add `NarrativeMode` with `unknown`;
   - extend native `StoryIR` schema to require `narrativeMode`;
   - extend native invention boundaries to require `motives` and `undocumentedActions`;
   - keep compatibility defaults in adapters only;
   - add Task 04 issue codes and ownership-aligned validators.

2. Update Task 02 adapters in `story-artifact-model.ts`.
   - map missing legacy `narrativeMode` to `unknown`;
   - supply conservative defaults for `motives` and `undocumentedActions`;
   - preserve legacy parsing compatibility without native-schema relaxation.

3. Add `stable-json.ts`.
   - implement focused deterministic serializer;
   - add serializer unit tests;
   - reuse for StoryIR and contract hashing.

4. Add `genre-policy.ts`.
   - define typed policy IDs and rule-ID unions;
   - add immutable registry;
   - implement `resolveGenrePolicy()` only for lookup/version checks;
   - implement `validateGenrePolicyCompatibility()` separately.

5. Add `full-story-contract.ts`.
   - define contract schema, lineage union, build metrics, and discriminated build result;
   - compute effective generation boundaries;
   - derive contract only from validated StoryIR;
   - compute StoryIR content hash, contract content hash, and build fingerprint.

6. Export new modules from `index.ts`.

7. Add and update focused unit tests.

8. Update `docs/architecture/story-localization.md` and this plan only.

## 27. Files To Add Or Modify

Add:

- `packages/story-localization/src/genre-policy.ts`
- `packages/story-localization/src/genre-policy.unit.test.ts`
- `packages/story-localization/src/full-story-contract.ts`
- `packages/story-localization/src/full-story-contract.unit.test.ts`
- `packages/story-localization/src/stable-json.ts`
- `packages/story-localization/src/stable-json.unit.test.ts`

Modify only as necessary:

- `packages/story-localization/src/story-artifact-model.ts`
- `packages/story-localization/src/story-artifact-model.unit.test.ts`
- `packages/story-localization/src/index.ts`
- `docs/architecture/story-localization.md`
- `docs/plans/04-genre-policies-and-full-story-contract-plan.md`

Keep untouched:

- `packages/story-localization/src/localization-prompt-builder.ts`
- `packages/story-localization/src/short-rewrite.prompt.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/story-localization-batch-service.ts`
- `apps/cli/src/story-full-rewrite-command.ts`
- `apps/cli/src/story-short-rewrite-command.ts`
- persistence helpers
- cache helpers
- output schemas

## 28. Compatibility Assessment

Unchanged:

- CLI commands and options;
- prompt text and prompt-builder wiring;
- provider calls and provider routing;
- generated artifact schemas;
- physical artifact paths;
- `.env` and runtime configuration precedence;
- cache and resume behavior;
- batch behavior;
- language support: `en`, `de`, `es`, `fr`, `pt`;
- locale support: `en-US`, `de-DE`, `es-419`, `fr-FR`, `pt-BR`.

Changed only at the internal-model layer:

- native StoryIR becomes stricter for new fields;
- legacy adapters preserve backward compatibility by mapping missing values explicitly;
- new policy/contract/serializer modules are exported for later tasks;
- no production rewiring occurs in Task 04.

## 29. Acceptance Criteria

Task 04 implementation is complete only when:

- legacy StoryIR adaptation remains backward compatible;
- native StoryIR requires explicit `narrativeMode`;
- `NarrativeMode` includes `unknown`;
- native StoryIR requires explicit `motives` and `undocumentedActions`;
- compatibility defaults exist only in adapters;
- typed policy IDs and typed policy rule IDs exist;
- deterministic policy lookup is separate from policy compatibility validation;
- effective generation boundaries are resolved before Task 05;
- the build result is a strict discriminated union;
- metrics are outside the contract body;
- the contract derives only from validated StoryIR;
- no diagnostic artifact is promoted to source truth;
- the stable serializer is tested;
- StoryIR content hash, contract content hash, and build fingerprint are distinct;
- lineage states are explicit through a discriminated union;
- no validation is claimed deterministic unless backed by structured data available in Task 04;
- full-only constraints are enforced by schema;
- no production rewiring occurs;
- no paid API calls are made;
- Task 05 is not started.

## 30. Remaining Uncertainties

- Whether any current persisted Task 02 StoryIR artifacts already exist outside tests and need explicit versioned compatibility reads, or whether compatibility is only required through legacy adapters.
- Whether any current adapter emits a formal placeholder threat description that should be treated as warning instead of blocking, or whether empty/blank threat is the only deterministic invalid case visible in current source.
- Whether `StoryIR.climax` should remain the internal field name for compatibility while `FullStoryContract` uses `narrativeCulmination`, or whether a compatibility alias in the model layer is warranted during implementation.
