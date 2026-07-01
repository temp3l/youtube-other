# Story Pipeline Dependency Graphs

## Current Workflow

```mermaid
flowchart TD
  Source[English source] --> Clean[Source cleaning/parsing]
  Clean --> ProductionContext[Source analysis + bible + retention plan]
  ProductionContext --> RewriteEn[Canonical English full rewrite]
  RewriteEn --> ValidateEn[Deterministic full validation]
  ValidateEn --> PersistEn[Persist en/full canonical artifact]
  PersistEn --> EnglishShort[Optional English short]
  PersistEn --> LocalizeLoop[Loop de/es/fr/pt localized full]
  LocalizeLoop --> LocalizedMixed[Optional legacy mixed localized short]
  PersistEn --> AnalyzeFull[Manual stories analyze full]
  LocalizeLoop --> AnalyzeLocalized[Manual stories analyze localized full]
  PersistEn --> MediaLegacy[Separate episode/images/render/media commands]
```

## Recommended Workflow

```mermaid
flowchart TD
  Source[Original English full story] --> RewriteAttempt[Attempt canonical English full rewrite]
  RewriteAttempt --> RewriteOk{Rewrite generated?}
  RewriteOk -- yes --> ValidateGenerated[Schema + deterministic validation]
  ValidateGenerated --> QualityGenerated[English full quality gate]
  QualityGenerated --> EnglishAccepted{Accepted?}
  RewriteOk -- no --> PersistRewriteFailure[Persist typed rewrite failure]
  PersistRewriteFailure --> ValidateSource[Validate original source]
  ValidateSource --> QualitySource[Source fallback quality gate]
  QualitySource --> SourceAccepted{Accepted?}
  SourceAccepted -- yes --> CanonicalFallback[Persist canonical en full provenance source-fallback]
  EnglishAccepted -- yes --> CanonicalGenerated[Persist canonical en full provenance generated]
  CanonicalGenerated --> Branch[Downstream branches]
  CanonicalFallback --> Branch
  SourceAccepted -- no --> BlockCanonical[Block canonical English]
  EnglishAccepted -- no --> BlockCanonical
  Branch --> EnglishShort[English short branch]
  Branch --> LocaleBranches[de/fr/es/pt full branches]
  Branch --> VisualBranch[English visual branch + shared images]
  LocaleBranches --> LocalizedShorts[Accepted locale short branches]
  EnglishShort --> MediaBranches[Audio metadata thumbnail render publish]
  LocalizedShorts --> MediaBranches
```

## English Critical Path

```mermaid
flowchart TD
  S[Load original source] --> R[Rewrite en full]
  R --> RS[Validate response schema]
  RS --> DV[Deterministic validation]
  DV --> QA[Story production analysis]
  QA --> Gate[Production gate]
  Gate --> Persist[Persist canonical English generated]
  Persist --> Continue[Continue downstream]
```

## English Fallback

```mermaid
flowchart TD
  R[Rewrite en full] --> Failure[Provider/schema/parse/infrastructure failure]
  Failure --> Preserve[Persist rewrite failure outcome]
  Preserve --> ValidateOriginal[Deterministic validation on original source]
  ValidateOriginal --> SourceQA[Story quality check on original source]
  SourceQA --> Gate[Production gate]
  Gate --> Pass{Pass?}
  Pass -- yes --> Fallback[Persist canonical English provenance source-fallback]
  Fallback --> Warn[Emit warning and continue]
  Pass -- no --> Block[Block canonical English and dependents]
  Block --> NoImages[Do not generate shared images]
```

## Locale Fallback

```mermaid
flowchart TD
  L[Generate localized full] --> OK{Generated?}
  OK -- yes --> Validate[Locale deterministic validation]
  Validate --> QA[Locale quality gate]
  QA --> Accepted{Accepted?}
  Accepted -- yes --> Continue[Continue locale]
  OK -- no --> Failure[Persist localization failure]
  Failure --> Candidates[Find same-locale fallback candidates]
  Candidates --> Candidate{Available?}
  Candidate -- no --> BlockLocale[Block only locale]
  Candidate -- yes --> ValidateFallback[Validate fallback]
  ValidateFallback --> FallbackQA[Fallback quality gate]
  FallbackQA --> FallbackAccepted{Accepted?}
  FallbackAccepted -- yes --> ContinueFallback[Continue locale provenance localized-fallback]
  FallbackAccepted -- no --> BlockLocale
```

## Locale Branching

```mermaid
flowchart TD
  EnAccepted[Accepted canonical English full] --> DE[de full]
  EnAccepted --> FR[fr full]
  EnAccepted --> ES[es full]
  EnAccepted --> PT[pt full]
  DE --> DEShort[de short if de full accepted]
  FR --> FRShort[fr short if fr full accepted]
  ES --> ESShort[es short if es full accepted]
  PT --> PTShort[pt short if pt full accepted]
  DE -. failure .-> DEBlocked[de blocked only]
  FR -. failure .-> FRBlocked[fr blocked only]
```

## Full And Short Independence

```mermaid
flowchart TD
  FullGen[Full generation] --> FullGate[Full validation + quality gate]
  FullGate --> FullAccepted{Full accepted?}
  FullAccepted -- no --> ShortSkipped[Short skipped dependency-blocked]
  FullAccepted -- yes --> ShortGen[Short generation]
  ShortGen --> ShortGate[Short validation + quality gate]
  ShortGate --> ShortAccepted{Short accepted?}
  ShortAccepted -- yes --> ShortMedia[Short audio metadata render]
  ShortAccepted -- no --> FullMedia[Full media can still proceed]
```

## Visual Branch

```mermaid
flowchart TD
  EnGate[English full production gate passed] --> VisualModel[Language-neutral visual model]
  VisualModel --> Scenes[Scene extraction / scene plan]
  Scenes --> ImagePrompts[Image prompts]
  ImagePrompts --> SharedImages[Shared landscape images]
  SharedImages --> FullRenders[Full renders per accepted locale]
  SharedImages --> ShortStrategy[Short crop/pan/regenerate strategy]
  ShortStrategy --> ShortRenders[Short renders per accepted short]
  DEFail[German failed] -. does not block .-> SharedImages
```

## Provider Batch Submission

```mermaid
flowchart TD
  ReadyStages[Eligible ready stages] --> Group[Group by endpoint/model/schema]
  Group --> Manifest[Write local batch manifest]
  Manifest --> Jsonl[Write JSONL input]
  Jsonl --> Upload[Upload input file]
  Upload --> Submit[Submit provider batch]
  Submit --> PersistIds[Persist file id and batch id]
```

## Provider Batch Reconciliation

```mermaid
flowchart TD
  Poll[Poll provider batch] --> Complete{Completed?}
  Complete -- no --> PersistStatus[Persist status]
  Complete -- yes --> Download[Download output/error files]
  Download --> Correlate[Correlate custom_id to stageId]
  Correlate --> ValidateEach[Schema + deterministic validation per item]
  ValidateEach --> PersistEach[Persist accepted artifacts per item]
  ValidateEach --> FailEach[Persist per-item failures]
  FailEach --> RetryItems[Create retry manifest for retryable items]
```

## Retries

```mermaid
flowchart TD
  StageFailed[Stage failed] --> Retryable{Retryable?}
  Retryable -- no --> FinalFailure[Persist permanent failure]
  Retryable -- yes --> Budget{Budget and retry cap available?}
  Budget -- no --> BudgetBlocked[Persist budget/retry-cap block]
  Budget -- yes --> Backoff[Backoff with jitter]
  Backoff --> Retry[Retry stage or batch item]
```

## Resume

```mermaid
flowchart TD
  Start[Resume workflow] --> Load[Load workflow manifest]
  Load --> ValidateManifest[Schema/version validation]
  ValidateManifest --> Fingerprints[Recompute dependency fingerprints]
  Fingerprints --> Current{Artifacts current?}
  Current -- yes --> Reuse[Mark cache-reused/resumed]
  Current -- no --> Invalidate[Invalidate affected stages only]
  Reuse --> Schedule[Schedule remaining ready stages]
  Invalidate --> Schedule
```

## Invalidation

```mermaid
flowchart TD
  Change[Input/config change] --> Matrix[Apply invalidation matrix]
  Matrix --> Affected[Mark affected stages stale]
  Matrix --> Reusable[Keep unrelated artifacts reusable]
  Affected --> Regenerate[Regenerate only dependencies]
  Reusable --> Status[Expose reused artifacts in report]
```

## Render Dependencies

```mermaid
flowchart TD
  Story[Accepted story locale+format] --> Audio[Audio]
  Story --> Captions[Captions/subtitles]
  Story --> Metadata[Metadata]
  Story --> Scenes[Scene/visual plan]
  Scenes --> Images[Images]
  Audio --> Render[Render]
  Captions --> Render
  Images --> Render
  Render --> Publish[Publish]
  Metadata --> Publish
  Thumbnail[Thumbnail] --> Publish
```
