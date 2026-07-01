# Story Pipeline Schema Design

## Ownership

- New package proposal: `packages/workflow` owns generic workflow IDs, stage graph, outcomes, failure taxonomy, manifest store, locks, and status report schemas.
- `packages/story-localization` owns story-specific artifact schemas, locale profiles, validation results, quality reports, and story package projections.
- `packages/shared` owns canonical locale normalization, episode IDs, content variants, path safety, and atomic IO.
- Downstream packages own their artifacts; workflow stores references and fingerprints, not duplicated payloads.

## TypeScript Planning Proposals

```ts
type WorkflowId = string & { readonly __brand: "WorkflowId" };
type ExecutionId = string & { readonly __brand: "ExecutionId" };
type StageId = string & { readonly __brand: "StageId" };
type ArtifactId = string & { readonly __brand: "ArtifactId" };
type ProviderBatchId = string & { readonly __brand: "ProviderBatchId" };
type EpisodeId = import("@mediaforge/shared").EpisodeId;

type Locale = "en" | "de" | "fr" | "es" | "pt";
type StoryFormat = "full" | "short";

type StageType =
  | "ingest-source"
  | "rewrite-full"
  | "validate-full"
  | "quality-full"
  | "localize-full"
  | "rewrite-short"
  | "validate-short"
  | "quality-short"
  | "scene-extraction"
  | "visual-model"
  | "image-prompt"
  | "image-generation"
  | "thumbnail"
  | "audio"
  | "captions"
  | "metadata"
  | "render"
  | "publish";

type ArtifactProvenance =
  | "source"
  | "generated"
  | "source-fallback"
  | "localized-fallback"
  | "cache"
  | "manual"
  | "imported"
  | "legacy-compatibility";

type StageStatus =
  | "planned"
  | "running"
  | "succeeded"
  | "failed"
  | "blocked"
  | "skipped"
  | "cancelled"
  | "cached";

type Retryability = "retryable" | "not-retryable" | "retry-after-change" | "manual-review";

interface StageWarning {
  readonly code: string;
  readonly message: string;
  readonly emittedAt: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

interface StageFailure {
  readonly category: FailureCategory;
  readonly retryability: Retryability;
  readonly message: string;
  readonly occurredAt: string;
  readonly providerStatusCode?: number;
  readonly providerErrorCode?: string;
  readonly causeStageId?: StageId;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

type StageOutcome<TArtifactRef> =
  | {
      readonly status: "succeeded" | "cached";
      readonly stageId: StageId;
      readonly artifact: TArtifactRef;
      readonly provenance: ArtifactProvenance;
      readonly warnings: readonly StageWarning[];
      readonly cost: CostMetrics;
      readonly completedAt: string;
    }
  | {
      readonly status: "failed" | "blocked" | "skipped" | "cancelled";
      readonly stageId: StageId;
      readonly failure: StageFailure;
      readonly warnings: readonly StageWarning[];
      readonly cost: CostMetrics;
      readonly completedAt: string;
    };

type QualityGateStatus =
  | "READY"
  | "READY_WITH_MINOR_EDITS"
  | "REVISION_REQUIRED"
  | "REWRITE_REQUIRED"
  | "BLOCKED";

interface QualityGateDecision {
  readonly status: QualityGateStatus;
  readonly pass: boolean;
  readonly profile: "production" | "fallback-production" | string;
  readonly gateVersion: string;
  readonly deterministicValidationStatus: "passed" | "failed" | "skipped";
  readonly analysisArtifactId?: ArtifactId;
  readonly failedChecks: readonly string[];
  readonly warnings: readonly StageWarning[];
}

interface ArtifactLineage {
  readonly artifactId: ArtifactId;
  readonly artifactType: string;
  readonly locale?: Locale;
  readonly format?: StoryFormat;
  readonly provenance: ArtifactProvenance;
  readonly path: string;
  readonly fingerprint: string;
  readonly schemaVersion: string;
  readonly parents: readonly ArtifactId[];
  readonly sourceStageId: StageId;
}

interface CostMetrics {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly estimatedCostMicros: number | null;
  readonly actualCostMicros: number | null;
  readonly pricingVersion?: string;
}

interface CacheMetadata {
  readonly status: "hit" | "miss" | "stale" | "invalid" | "forced" | "bypassed";
  readonly cacheKey?: string;
  readonly cacheSchemaVersion?: string;
  readonly reusedArtifactId?: ArtifactId;
  readonly invalidationReasons: readonly string[];
}

interface FingerprintInputs {
  readonly sourceFingerprint?: string;
  readonly parentFingerprints: readonly string[];
  readonly promptFingerprint?: string;
  readonly schemaFingerprint?: string;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly configFingerprint?: string;
  readonly workflowSchemaVersion: string;
}
```

## Runtime Validation

Use Zod schemas mirroring every persisted type. IDs must use regex-validated prefixes:

- `wf_<slug>_<timestamp>_<shortHash>`
- `exec_<isoCompact>_<shortHash>`
- `stage:<stageType>:<locale?>:<format?>`
- `artifact:<episodeId>:<locale?>:<format?>:<owner>:<hash8>`

Locale schema must reject `sp` by default. A migration-only parser may map `sp` to `es` while recording a warning and refusing to proceed if both branches exist.

## Serialization

- Workflow manifests are stable JSON with sorted keys where hashing is required.
- Stage outcomes are append-only in attempt history; current state is derived from latest attempt.
- Artifact payloads remain in package-owned files; workflow stores references.
- Provider request/response payloads remain in existing debug/batch directories and are redacted from normal status.

## Versioning And Migration

- `workflowManifestSchemaVersion: "story-workflow-manifest-v1"`.
- `stageOutcomeSchemaVersion: "stage-outcome-v1"`.
- `failureSchemaVersion: "stage-failure-v1"`.
- Migrations are explicit pure functions and never silently reinterpret `sp` as a second locale.

## Failure Taxonomy Contract

| Category | Retryability | Fallback eligibility | Downstream behavior |
| --- | --- | --- | --- |
| `source-missing` | not-retryable until input changes | no | block source dependents |
| `source-invalid` | not-retryable until input changes | no | block source dependents |
| `rewrite-provider-failure` | retryable | English source fallback eligible | evaluate fallback, then continue or block |
| `rewrite-timeout` | retryable | eligible | same as provider failure |
| `rewrite-rate-limited` | retryable with backoff | eligible after retry exhaustion | same |
| `rewrite-quota-failure` | retry-after-change | eligible | same |
| `rewrite-schema-invalid` | retryable once/regenerate | eligible after exhaustion | same |
| `rewrite-local-validation-failed` | not auto-retry unless repair route exists | no source fallback unless failure was generated candidate only | block rewrite candidate |
| `rewrite-quality-gate-failed` | not auto-retry | no provider fallback; repair/review allowed | block canonical English |
| `source-fallback-accepted` | not failure | n/a | continue |
| `source-fallback-rejected` | not-retryable until source changes/manual override | no | block canonical English and images |
| `localization-provider-failure` | retryable | localized fallback eligible | block only locale if no fallback |
| `localization-schema-invalid` | retryable once/regenerate | eligible after exhaustion | block only locale if no fallback |
| `locale-validation-failed` | not auto-retry unless repair route exists | fallback eligible if candidate is different | block only locale |
| `locale-quality-gate-failed` | not auto-retry | fallback not from same rejected artifact | block only locale |
| `locale-fallback-accepted` | not failure | n/a | continue locale |
| `locale-fallback-rejected` | not-retryable until candidate changes | no | block only locale |
| `short-generation-failed` | retryable by short service | no full fallback | block only short dependents |
| `short-validation-failed` | not auto-retry unless repair route exists | no | block short quality/audio/metadata/render |
| `short-quality-gate-failed` | not auto-retry | no | block short dependents |
| `audio-generation-failed` | retryable/fallback model | no | block render needing audio |
| `metadata-generation-failed` | retryable/fallback model | no | block publish needing metadata |
| `scene-extraction-failed` | retryable if provider-backed | no | block visual/image/render |
| `visual-model-failed` | retryable | no | block images |
| `image-generation-failed` | retryable unless policy | no | block renders needing missing images |
| `thumbnail-generation-failed` | retryable unless policy | no | block publish needing thumbnail |
| `render-failed` | retryable; remote may fallback local | no | block publish |
| `publish-failed` | retryable depending API error | no | publication failed only |
| `persistence-failed` | retryable after storage fix | no | block stage success recording |
| `cache-corrupt` | retry-after-change; bypass cache | no | regenerate affected stage |
| `manifest-version-incompatible` | migration required | no | block workflow resume |
| `fingerprint-mismatch` | not retryable until invalidation/regeneration | no | block stale artifact reuse |
| `dependency-blocked` | follows dependency | no | skip/block dependent |
| `budget-exceeded` | retry-after-budget-change | no | stop scheduling scoped stages |
| `policy-blocked` | not auto-retry | no | block affected branch |
| `copyright-blocked` | not auto-retry | no | block affected branch |
| `provenance-blocked` | manual review | no | block affected branch |
| `cancelled` | retryable by resume | no | stop requested stages |
| `skipped` | n/a | no | no-op |
| `resumed` | n/a | no | continue |
| `cache-reused` | n/a | no | continue |

Backoff defaults: transient provider failures use exponential backoff with jitter, max 3 attempts unless package-specific retry caps are stricter. Permanent content/policy/provenance failures are never retried automatically.

## Existing Types Replaced Or Extended

- Extends `LanguageCode`, `LocaleCode`, short/full artifact schemas, story cache entries, batch manifests, production analysis artifacts, media stage dependency records, execution telemetry.
- Does not replace package-owned payload schemas in the first migration.
