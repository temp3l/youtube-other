# Agent C — API, contracts, and product boundary

## Scope and evidence

This is a read-only planning workstream. It covers the existing HTTP and typed
contract surface, the public product boundary, architecture strategy scoring,
and an implementation-ready `/v1` contract. It does not select authentication,
database, queue, or object-storage products.

**Verified.** `apps/api/src/index.ts:startApiServer` is a single Node
`http.createServer` handler. It ignores the request, returns the same JSON for
every route, and includes the resolved local `workspace` path in the response
(`apps/api/src/index.ts:4-9`). It is not currently a product API.

**Verified.** `@mediaforge/api` has no HTTP framework, authentication,
OpenAPI, workflow-engine, queue, or YouTube dependency. Its declared runtime
dependencies are config, domain, persistence, and shared
(`apps/api/package.json:10-15`). A repository filename search found no OpenAPI,
Swagger, AsyncAPI, GraphQL, or tRPC contract outside this new planning area.

**Verified.** The repository already has a strict, versioned shared contract
vocabulary. `packages/domain/src/workflow-contracts.ts` defines branded IDs,
two discriminated content profiles, artifact references/manifests, task
policies, workflow definitions/instances, task states, approvals, batches,
normalized errors, attempts, telemetry, and events. Notable symbols are
`contentProfileSchema`, `artifactManifestSchema`, `workflowInstanceSchema`,
`approvalRecordSchema`, `batchManifestSchema`,
`normalizedWorkflowErrorSchema`, and `workflowEventSchema`.

**Verified.** Current workflow task states include `pending`, `ready`,
`blocked`, `running`, `succeeded`, `failed`, `interrupted`, `skipped`,
`invalidated`, and `awaiting-approval`
(`packages/domain/src/workflow-contracts.ts:373-464`). Approval records bind a
decision to a workflow instance, task, revision, artifact hashes, optional
quality-assessment hash, actor, and expiry
(`packages/domain/src/workflow-contracts.ts:625-646`).

**Verified.** The workflow engine is callable TypeScript, not intrinsically a
CLI subprocess. `WorkflowOperator` exposes `plan`, `status`, `initialize`,
`runNext`, `runTask`, `resume`, `retryFailed`, `invalidate`, `override`,
`reconcile`, and `validateState`
(`packages/workflow-engine/src/workflow-operator.ts`). `WorkflowStore` exposes
attempt interruption, approval recording, locks, stale-record recovery, and
reconciliation (`packages/workflow-engine/src/workflow-store.ts`). Batch
execution supports deterministic batch and item IDs, retries, `AbortSignal`,
cancellation, and reconciliation (`packages/workflow-engine/src/batch.ts`).

**Verified.** The primary composition roots are still in the CLI. For example,
`apps/cli/src/workflow-commands.ts` creates registries and
`WorkflowOperator`; `apps/cli/src/math-workflow-runtime.ts:1736-1899` builds
math implementations, fingerprint material, registry, and operator.
`apps/cli/package.json` directly depends on almost every capability package.
The API package does not have an equivalent application-use-case composition
root.

**Verified.** The shared profile contract deliberately distinguishes
`dark-truth` from `mathematics-education`
(`packages/domain/src/workflow-contracts.ts:70-158`). Dark Truth has strict,
hash- and revision-bound story-bible and reference-image contracts
(`packages/dark-truth/src/profile-contracts.ts:16-379`). Mathematics has
strict lesson-profile, curriculum, audience, deterministic-verification, and
visual-style contracts (`packages/math-education/src/profile-contracts.ts`);
its implemented identity contract currently restricts grades to 5–10 and
difficulty to `foundation`, `standard`, or `challenge`
(`packages/math-education/src/domain/identity.ts`).

**Verified.** Both profile task registries model publishing as a dry run, a
manual approval, and then an irreversible publish task:
`darktruth.publish-dry-run`, `darktruth.publish-approval`,
`darktruth.publish` (`packages/dark-truth/src/task-registry.ts:567-597`) and
their math equivalents (`packages/math-education/src/task-registry.ts:398-424`).

**Verified.** Existing YouTube code has useful duplicate guards but not a
complete distributed publication transaction. The generic publisher
fingerprints identity, channel, policy, playlists, and media/metadata hashes
(`packages/youtube-upload/src/generic-media-publish.ts:389-417`). The episode
uploader persists a `planned` report before `videos.insert`, then persists an
`uploaded` report only after the mutation sequence returns
(`packages/youtube-upload/src/index.ts:1622-1640,1673-1817`). The mutation
seam captures provider request/upload IDs after successful calls and can reuse
persisted video and playlist progress
(`packages/youtube-upload/src/youtube-mutation-seam.ts:38-47,117-143,206-315`).

**Inferred.** A crash after YouTube accepts `videos.insert` but before the
returned video ID is durably recorded can leave an ambiguous publication. A
blind retry can create a second video because the current pre-upload planned
report contains no accepted provider video ID. This is the key contract-level
reason not to equate an HTTP idempotency key with provider-side exactly-once
delivery.

## Architecture strategy comparison

Scores are 1 (poor/unfavourable) to 5 (excellent/favourable). For migration
cost and operational complexity, 5 means lower cost or lower complexity.

| Strategy                                             | Type safety | Reliability | Testability | Security | Observability | Cancellation | Retry / resume | Concurrency | Migration cost | Operational complexity | Maintainability | Total / 55 |
| ---------------------------------------------------- | ----------: | ----------: | ----------: | -------: | ------------: | -----------: | -------------: | ----------: | -------------: | ---------------------: | --------------: | ---------: |
| 1. API invokes CLI subprocesses                      |           1 |           2 |           2 |        1 |             2 |            2 |              2 |           2 |              5 |                      3 |               1 |         23 |
| 2. API invokes existing low-level packages           |           3 |           2 |           3 |        2 |             3 |            3 |              2 |           3 |              3 |                      4 |               2 |         30 |
| 3. Shared application/workflow layer for API and CLI |           5 |           4 |           5 |        4 |             4 |            4 |              4 |           4 |              3 |                      4 |               5 |         46 |
| 4. Separate workflow-control service                 |           5 |           5 |           5 |        4 |             5 |            5 |              5 |           5 |              1 |                      1 |               4 |         45 |

**Inferred.** Strategy 1 is superficially cheap because commands already
exist, but command strings, environment inheritance, stdout parsing, process
lifetimes, local paths, and exit-code translation become an untyped and
security-sensitive protocol. It is unsuitable for customer-controlled input.

**Inferred.** Strategy 2 avoids process bridging, but controllers would need
to assemble low-level packages in the same way the CLI currently does. That
would create the parallel workflow implementation prohibited by the
architectural invariant.

**Recommended.** Adopt strategy 3 as the target and migration path: extract
typed application use cases and a composition root from CLI-owned runtime
assembly; make CLI, HTTP controllers, workers, and schedulers thin adapters to
those use cases. Keep the first deployment a modular monolith plus worker
processes.

**Recommended.** Treat strategy 4 as an optional later deployment boundary,
not a different application model. A workflow-control service becomes useful
after workflow state, asset locations, tenancy, leases, and commands are
database/object-store based. Introducing it while authoritative state and
composition remain local would add distributed failure modes without removing
the current coupling.

**Recommended.** Permit strategy 1 only as a temporary, operator-only
compatibility adapter for a characterized command with fixed argv tokens,
allowlisted options, a scrubbed environment, bounded timeout/output, and no
shell. Never expose CLI syntax or arbitrary flags through the public API.

## Protocol decision

**Recommended.** Use resource-oriented REST under `/v1`, described by OpenAPI
3.1. REST fits asynchronous job resources, conditional requests, signed
webhooks, language-neutral SDK generation, and external integrations. Generate
request/response TypeScript types and SDKs from the checked contract, and
adapt them to internal domain types explicitly.

**Recommended.** Do not expose tRPC publicly. It tightly couples customers to
the server TypeScript graph and is awkward for stable non-TypeScript SDKs.
tRPC may be reconsidered only as a private web-backend transport over the same
application use cases.

**Recommended.** Do not use GraphQL for v1. It helps clients compose complex
read graphs but adds authorization, cost-control, caching, and mutation/error
complexity without improving the main product operation: start and observe a
long-running workflow. It can be reconsidered for a mature asset/catalog
query product.

**Unresolved.** Select the OpenAPI authoring tool and HTTP framework during
implementation. The contract must be the authority either way: generated
types must not drift from runtime validation, and CI must fail on unreviewed
breaking changes.

## Public product boundary

**Recommended.** The public API is a stable product model, not a projection of
packages or files. It must never return local paths, task implementation owner,
CLI command strings, provider request bodies, raw credentials, prompt bodies,
or package names. Internally, adapters may map public IDs to branded domain IDs
and asset IDs to storage locations.

**Recommended.** Keep common resource envelopes generic while making content
input explicitly profile-specific. Do not use `Record<string, unknown>` or
arbitrary extension bags as the profile escape hatch.

```ts
type EpisodeContentInput =
  | {
      type: "dark_truth";
      version: "1";
      premise?: string;
      sourceAssetIds?: string[];
      storyBibleId?: string;
      referenceAssetIds?: string[];
    }
  | {
      type: "mathematics_education";
      version: "1";
      curriculumSourceId: string;
      skillId: string;
      grade: 5 | 6 | 7 | 8 | 9 | 10;
      difficulty: "foundation" | "standard" | "challenge";
      presentationPresetId?: string;
      audioPresetId?: string;
    };
```

**Recommended.** Map `dark_truth` and `mathematics_education` to internal
profile IDs in one application adapter. Keep story-bible revisions,
supernatural rules, reference approvals, curriculum mappings, exact math
semantics, chalkboard state, exercises, and differentiated difficulty in
profile-owned typed commands and artifacts. Shared API fields should be
limited to identity, locale, variant, lifecycle, assets, validations,
approvals, and publications.

**Recommended.** Limit mathematics grade input to 5–10 in v1. Supporting
higher grades requires an intentional contract expansion and evidence that
curriculum, identity, verification, and rendering support them; the broader
shared profile maximum of 13 does not prove end-to-end support.

## Resource model

The public containment and reference model should be:

```text
Workspace
├── Users, ServiceAccounts, ApiKeys, WebhookEndpoints
├── Projects
│   ├── ContentProfiles / Brands
│   ├── Channels
│   ├── Series
│   ├── ContentSources, StoryBibles, CurriculumSources
│   ├── ReferenceAssets, Presets
│   └── Episodes
│       ├── WorkflowRuns ── Jobs ── public phase summaries
│       ├── Assets
│       ├── ValidationResults
│       ├── Approvals
│       └── Publications ── PublishingTargets
└── UsageRecords, AuditEvents
```

**Recommended.** Resource responsibilities:

| Resource                | Public v1 role                                                  | Mutability                     |
| ----------------------- | --------------------------------------------------------------- | ------------------------------ |
| Workspace               | Tenant boundary and billing/authorization scope                 | Admin-controlled               |
| User                    | Human membership reference; identity originates in IdP          | Membership actions only        |
| Service account         | Non-human principal                                             | Admin-controlled               |
| API key                 | Scoped credential metadata; secret returned only at creation    | Create/rotate/revoke           |
| Project                 | Groups a product configuration and content                      | CRUD                           |
| Content profile / brand | Versioned typed Dark Truth or math policy configuration         | Revisioned                     |
| Channel                 | Tenant-owned publication channel metadata; no credential fields | CRUD/connection actions        |
| Series                  | Editorial grouping and default playlists/presets                | CRUD                           |
| Episode                 | Stable production unit with typed content input                 | Create/read; revision commands |
| Content source          | Provenance-bearing structured or uploaded source                | Revisioned                     |
| Story bible             | Dark Truth profile resource                                     | Revisioned and approved        |
| Curriculum source       | Math profile resource                                           | Revisioned and reviewed        |
| Reference asset         | Logical reference to an immutable asset                         | Revisioned metadata            |
| Locale                  | Read-only supported-locale catalog plus project enablement      | Read/configure                 |
| Preset                  | Typed audio/presentation/render policy reference                | Revisioned                     |
| Workflow template       | Stable, read-only high-level recipe and phases                  | Server-managed                 |
| Workflow run            | One execution of one workflow template for an episode/revision  | Command-driven                 |
| Job                     | API acceptance/execution handle, including batches              | Command-driven                 |
| Step                    | Read-only abstract phase status; not executable publicly        | Read-only                      |
| Asset                   | Immutable stored output/input descriptor and delivery links     | Create upload intent/read      |
| Validation result       | Immutable assessment of a bound artifact/revision               | Read-only                      |
| Approval                | Attributable decision bound to hashes/revision                  | Append decision/revoke         |
| Publishing target       | Channel plus visibility/schedule/default playlist policy        | CRUD                           |
| Publication             | Durable intent and eventual provider result                     | Create/read/cancel when safe   |
| Webhook endpoint        | Event subscription and secret lifecycle                         | CRUD/rotate                    |
| Usage record            | Metering fact                                                   | Read-only                      |
| Audit event             | Immutable security/business action record                       | Read-only                      |

**Recommended.** Keep detailed workflow definitions, task IDs, task
implementation ownership, attempt control, worker leases, provider callbacks,
dead-letter administration, and state reconciliation under a separate
`/_internal/v1` surface. External callers may see abstract phase/step
summaries, but cannot execute an individual narration, render, repair, or
publish task.

## `/v1` queries and commands

All tenant resources are authorized against the workspace in the path; a token
claim never silently substitutes a different workspace.

### Configuration and catalogs

```http
GET    /v1/workspaces/{workspaceId}
GET    /v1/workspaces/{workspaceId}/projects
POST   /v1/workspaces/{workspaceId}/projects
GET    /v1/workspaces/{workspaceId}/projects/{projectId}
PATCH  /v1/workspaces/{workspaceId}/projects/{projectId}

GET    /v1/workspaces/{workspaceId}/projects/{projectId}/channels
POST   /v1/workspaces/{workspaceId}/projects/{projectId}/channels
GET    /v1/workspaces/{workspaceId}/projects/{projectId}/series
POST   /v1/workspaces/{workspaceId}/projects/{projectId}/series
GET    /v1/workspaces/{workspaceId}/projects/{projectId}/presets
GET    /v1/workspaces/{workspaceId}/projects/{projectId}/workflow-templates
GET    /v1/locales
```

**Recommended.** Channel creation records metadata only. OAuth/OIDC
credential connection is a separate privileged command with a short-lived
authorization flow; request and response schemas never contain refresh tokens.

### Sources and assets

```http
POST   /v1/workspaces/{workspaceId}/projects/{projectId}/content-sources
POST   /v1/workspaces/{workspaceId}/projects/{projectId}/story-bibles
POST   /v1/workspaces/{workspaceId}/projects/{projectId}/curriculum-sources
POST   /v1/workspaces/{workspaceId}/projects/{projectId}/assets:prepare-upload
POST   /v1/workspaces/{workspaceId}/projects/{projectId}/assets:complete-upload
GET    /v1/workspaces/{workspaceId}/projects/{projectId}/assets/{assetId}
POST   /v1/workspaces/{workspaceId}/projects/{projectId}/assets/{assetId}:prepare-download
```

**Recommended.** The upload preparation response contains a short-lived
pre-signed URL, required headers, maximum size, accepted MIME types, and an
upload ID. Completion verifies size/hash/MIME before an asset becomes usable.
The asset resource exposes `id`, `kind`, `mediaType`, `sizeBytes`,
`checksumSha256`, lifecycle, provenance, and expiry/retention metadata—not a
storage key or filesystem path.

### Episodes and workflows

```http
GET    /v1/workspaces/{workspaceId}/projects/{projectId}/episodes
POST   /v1/workspaces/{workspaceId}/projects/{projectId}/episodes
GET    /v1/workspaces/{workspaceId}/projects/{projectId}/episodes/{episodeId}
PATCH  /v1/workspaces/{workspaceId}/projects/{projectId}/episodes/{episodeId}

POST   /v1/workspaces/{workspaceId}/projects/{projectId}/episodes/{episodeId}/workflow-runs
GET    /v1/workspaces/{workspaceId}/projects/{projectId}/workflow-runs/{runId}
GET    /v1/workspaces/{workspaceId}/projects/{projectId}/workflow-runs/{runId}/steps
POST   /v1/workspaces/{workspaceId}/projects/{projectId}/workflow-runs/{runId}:resume
POST   /v1/workspaces/{workspaceId}/projects/{projectId}/workflow-runs/{runId}:cancel

GET    /v1/workspaces/{workspaceId}/projects/{projectId}/jobs/{jobId}
GET    /v1/workspaces/{workspaceId}/projects/{projectId}/jobs/{jobId}/items
```

The external start command should be high level:

```json
{
  "workflowTemplateId": "episode-production",
  "episodeRevision": "rev_01...",
  "locales": ["en", "de"],
  "variants": ["full", "short"],
  "approvalMode": "required",
  "publicationMode": "none"
}
```

**Recommended.** `publicationMode` is `none` in the initial public workflow.
Publishing remains a separate approved command, making cost and irreversible
side effects explicit. Do not accept a list of low-level step names.

### Validation, approval, and publication

```http
GET    /v1/workspaces/{workspaceId}/projects/{projectId}/episodes/{episodeId}/validation-results
POST   /v1/workspaces/{workspaceId}/projects/{projectId}/approvals
GET    /v1/workspaces/{workspaceId}/projects/{projectId}/approvals/{approvalId}
POST   /v1/workspaces/{workspaceId}/projects/{projectId}/approvals/{approvalId}:revoke

POST   /v1/workspaces/{workspaceId}/projects/{projectId}/publications
GET    /v1/workspaces/{workspaceId}/projects/{projectId}/publications/{publicationId}
POST   /v1/workspaces/{workspaceId}/projects/{projectId}/publications/{publicationId}:cancel
```

**Recommended.** Approval creation accepts a `subject` (workflow run or
publication intent), decision, reason, expected subject revision, and the
server-presented approval challenge ID. The server derives actor identity from
the authenticated principal and binds the decision to current artifact and
quality hashes; clients must not submit arbitrary `actor` or artifact hashes.

**Recommended.** Publication creation requires an approved, immutable render
asset, metadata revision, thumbnail asset where applicable, publishing target,
locale/variant, visibility, optional RFC 3339 schedule, and current approval
ID. It returns `202` with a publication and job. Playlist assignment is part of
the publication intent and is reconciled independently for partial success.

### Webhooks, usage, and audit

```http
GET    /v1/workspaces/{workspaceId}/webhook-endpoints
POST   /v1/workspaces/{workspaceId}/webhook-endpoints
PATCH  /v1/workspaces/{workspaceId}/webhook-endpoints/{endpointId}
POST   /v1/workspaces/{workspaceId}/webhook-endpoints/{endpointId}:rotate-secret
POST   /v1/workspaces/{workspaceId}/webhook-endpoints/{endpointId}:test
GET    /v1/workspaces/{workspaceId}/usage-records
GET    /v1/workspaces/{workspaceId}/audit-events
```

## Asynchronous response and state model

**Recommended.** Every potentially long, paid, queued, rendering, provider, or
irreversible command returns `202 Accepted`. Return the same shape for a newly
created operation and an idempotent replay:

```http
HTTP/1.1 202 Accepted
Location: /v1/workspaces/ws_123/projects/prj_123/jobs/job_123
Retry-After: 2
Content-Type: application/json
```

```json
{
  "job": {
    "id": "job_123",
    "status": "queued",
    "operation": "episode.production",
    "submittedAt": "2026-07-31T10:00:00Z",
    "workflowRunIds": ["wrun_123"],
    "resource": {
      "type": "episode",
      "id": "ep_123"
    }
  }
}
```

**Recommended.** Public job states:

```text
queued
  └─ running
      ├─ waiting_for_approval ── running
      ├─ retry_scheduled ─────── running
      ├─ cancelling ──────────── cancelled
      ├─ succeeded
      ├─ succeeded_with_warnings
      ├─ partially_succeeded
      ├─ failed
      └─ dead_lettered
```

**Recommended.** `waiting_for_approval` is non-terminal.
`retry_scheduled` includes `nextAttemptAt`, retry count, and safe public error
code. `partially_succeeded` is terminal and enumerates successful and failed
items. `dead_lettered` is terminal for the public caller and requires an
operator or a new explicitly authorized retry command. Cache reuse is reported
per abstract step as `execution: "cache_hit"` and as a job statistic, not as a
separate success state.

**Recommended.** Progress is phase- and count-based:
`currentPhase`, `completedSteps`, `knownSteps`, and `message`. Do not return a
percentage unless the denominator and work weights are deterministic. Render
time and provider latency are not sufficiently predictable for false-precision
percentages.

**Recommended.** Cancellation is cooperative and idempotent. The command
returns `202` while work is stopping, `200` for an already cancelled job, and
`409 operation_not_cancellable` once an irreversible provider mutation is in
an unsafe boundary. A cancellation request never claims rollback of an upload
already accepted by YouTube.

**Recommended.** Resume creates a new job/attempt linked by `causationId` to
the existing workflow run; it does not create a second workflow run. Resume is
allowed only for `interrupted`, retryable failed, or explicitly reconciled
states, and starts from the first invalid/non-authoritative step. This maps to
the existing `WorkflowOperator.resume`, `retryFailed`, cache, and reconcile
capabilities without exposing their task-level syntax.

## Idempotency and concurrency contract

**Recommended.** Require `Idempotency-Key` on all create and command requests
that can spend money, enqueue work, approve, or mutate an external provider.
Accept 1–255 printable ASCII characters and encourage UUIDv7. Scope a key to:

```text
(workspace_id, authenticated_principal_id, HTTP method, normalized route)
```

Do not scope only by API key, because rotated credentials represent the same
principal.

**Recommended.** Compute a request fingerprint from the method, normalized
route parameters, canonical query, API contract version, and canonicalized
validated body. Exclude tracing headers, authorization, and harmless transport
headers.

**Recommended.** Replay behavior:

1. First use atomically stores key, fingerprint, command ID, status, response
   headers/body, and expiry before enqueueing through an outbox.
2. Same key and fingerprint returns the stored status/body and identical
   resource IDs; include `Idempotency-Replayed: true`.
3. Same key while acceptance is unresolved returns `409
idempotency_request_in_progress` with the existing job link.
4. Same key with a different fingerprint returns `409
idempotency_key_conflict`; never execute the second request.
5. Retain ordinary command records for at least 24 hours and irreversible
   approval/publication command records for at least 90 days. Publication
   intents and their deduplication identities are permanent audit records even
   after the header-key replay window expires.

**Recommended.** Use `ETag` on mutable resources and require `If-Match` on
PATCH, approval, cancellation, and schedule-changing commands. Return `428
precondition_required` when absent and `412 precondition_failed` when stale.
Use a database uniqueness constraint for each accepted command and
publication intent; in-process locks are not the authority.

**Recommended.** Batch creation assigns a stable server item ID from the batch
command plus client item key. Each item has an independent idempotency record
and result. Replaying a partially completed batch may enqueue only unresolved,
retryable items; it must not replay succeeded items.

### Exact duplicate-publication prevention

**Recommended.** Model publishing as a durable state machine:

```text
requested → approval_verified → upload_session_reserved → uploading
          → provider_accepted → verifying → playlist_reconciling
          → succeeded | partially_succeeded
          ↘ reconciliation_required | failed_safe
```

The following rules prevent an automatic duplicate even across crashes:

1. Create one immutable `publication_intent` transactionally with the
   idempotency record and outbox event. Enforce uniqueness on
   `(workspace_id, publishing_target_id, publication_intent_id)`.
2. Bind the intent to render hash, metadata hash, thumbnail hash, locale,
   variant, schedule, playlists, channel credential version, and approval
   hash. A changed binding requires a new approval and intent.
3. Claim the intent with a lease. Before sending video bytes, initiate a
   resumable YouTube upload and durably save the session URI/opaque provider
   token and attempt number. This requires a publication port that exposes the
   resumable-session boundary rather than a single opaque `videos.insert`.
4. Persist provider video ID, provider request ID, and acceptance evidence
   immediately after finalization, before thumbnail/playlist work. Later
   mutations are independently idempotent/reconciled by
   `(publication_id, operation, target_id)`.
5. On restart, if a session exists but no video ID exists, query/resume that
   session. Never create a new upload session for the same intent while the
   previous provider outcome is ambiguous.
6. If YouTube accepted the upload but the response was lost and the session
   cannot recover the video ID, set `reconciliation_required`; stop automatic
   retry. An operator must identify and bind the accepted video or attest that
   no video exists. The safe failure mode is delayed publication, not a
   duplicate.
7. Before playlist insertion, query for the video/playlist membership or bind
   the provider playlist-item ID. A crash after insertion resumes by
   reconciliation, not blind insertion.

**Verified.** Steps 3 and 6 are target-state gaps. Current episode upload uses
`uploadType: "resumable"` but the application does not durably store a session
URI before uploading (`packages/youtube-upload/src/index.ts:1682-1689`).
Provider request IDs are observed only in `onSuccess`
(`packages/youtube-upload/src/index.ts:1744-1753`); they are evidence, not a
provider idempotency key.

## Error contract

**Recommended.** Use RFC 9457 Problem Details with content type
`application/problem+json`. Keep a stable machine `code`; do not expose stack
traces, raw provider payloads, local paths, secret-bearing remediation, or
internal `causeName`.

```json
{
  "type": "https://api.mediaforge.example/problems/idempotency-key-conflict",
  "title": "Idempotency key conflict",
  "status": 409,
  "detail": "The key was already used with different request parameters.",
  "code": "idempotency_key_conflict",
  "requestId": "req_123",
  "retryable": false,
  "errors": [
    {
      "path": "$.metadataRevision",
      "code": "resource_revision_changed",
      "message": "Use the current metadata revision."
    }
  ]
}
```

**Recommended.** Status mapping:

| HTTP | Public code examples                                                         | Meaning                                                  |
| ---: | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
|  400 | `malformed_request`, `unsupported_media_type`                                | Cannot parse request                                     |
|  401 | `authentication_required`, `invalid_token`                                   | No valid principal                                       |
|  403 | `permission_denied`, `publishing_not_allowed`                                | Principal exists but lacks permission                    |
|  404 | `resource_not_found`                                                         | Missing or intentionally concealed cross-tenant resource |
|  409 | `idempotency_key_conflict`, `workflow_conflict`, `operation_not_cancellable` | State conflict                                           |
|  412 | `precondition_failed`                                                        | Stale `If-Match`                                         |
|  422 | `validation_failed`, `approval_stale`, `profile_input_invalid`               | Parsed but semantically invalid                          |
|  428 | `precondition_required`                                                      | Missing required `If-Match`                              |
|  429 | `rate_limit_exceeded`, `quota_exceeded`                                      | Limit exceeded; include `Retry-After` where meaningful   |
|  502 | `provider_bad_response`                                                      | Upstream response invalid                                |
|  503 | `service_unavailable`, `provider_unavailable`                                | Transient capacity/provider issue                        |
|  500 | `internal_error`                                                             | Redacted unexpected failure                              |

**Recommended.** Map internal normalized workflow errors to this vocabulary in
the application/API adapter. Do not make the current uppercase error enum the
external wire contract, although it can be used as mapping input. Errors for
asynchronous work are persisted on the job/step using the same problem shape
without an HTTP `status` claim that implies a later poll response failed.

## Pagination and filtering

**Recommended.** Use opaque cursor pagination for every unbounded collection:

```http
GET .../episodes?page[size]=25&page[after]=opaque&sort=-createdAt
```

Default to 25, maximum 100. The cursor encodes and authenticates workspace,
filter hash, sort key, last value, and last ID. Use stable `(created_at, id)`
ordering and reject a cursor reused with different filters. Do not expose
database offsets.

```json
{
  "data": [],
  "page": {
    "nextCursor": null,
    "hasMore": false
  }
}
```

**Recommended.** Support allowlisted filters only, such as episode profile,
locale, lifecycle, created date; job status/operation; asset kind; publication
target/status; and audit action/date/principal. Return total counts only when
explicitly requested and cheap enough to enforce a bounded query budget.

## Versioning and compatibility

**Recommended.** Put the major version in the path (`/v1`). Within v1,
additive optional response fields, new event types, and new enum values are
allowed only if SDKs preserve unknown values. Removing/renaming fields,
changing requiredness or meaning, narrowing validation, or changing
idempotency scope requires `/v2` or an announced compatibility mechanism.

**Recommended.** Version profile-specific request unions independently with
their `version` discriminator. Publish a machine-readable OpenAPI document at
`/v1/openapi.json` and a build artifact. Use contract-diff CI, runtime
request/response validation tests, consumer fixtures, and SDK compile tests.
Never generate OpenAPI from internal package types without an explicit public
schema adapter.

**Recommended.** Deprecation responses include `Deprecation: true`,
`Sunset`, and a documentation `Link`. Maintain at least the documented pilot
support window; exact duration needs commercial approval.

## Events and webhooks

**Recommended.** Emit public, versioned events after the authoritative state
transaction through an outbox. Initial event types:

```text
workflow_run.started
workflow_run.waiting_for_approval
workflow_run.succeeded
workflow_run.partially_succeeded
workflow_run.failed
asset.ready
validation.completed
approval.recorded
approval.revoked
publication.started
publication.succeeded
publication.partially_succeeded
publication.failed
```

**Recommended.** Event envelope:

```json
{
  "id": "evt_123",
  "type": "workflow_run.succeeded",
  "apiVersion": "v1",
  "occurredAt": "2026-07-31T10:05:00Z",
  "workspaceId": "ws_123",
  "correlationId": "cor_123",
  "causationId": "cmd_123",
  "resource": {
    "type": "workflow_run",
    "id": "wrun_123",
    "url": "/v1/workspaces/ws_123/projects/prj_123/workflow-runs/wrun_123"
  },
  "data": {
    "status": "succeeded"
  }
}
```

**Recommended.** Keep webhook payloads small and fetch current resources from
the canonical API. Sign exact raw bytes using a per-endpoint secret and send
`X-MediaForge-Webhook-Id`, `X-MediaForge-Webhook-Timestamp`, and
`X-MediaForge-Webhook-Signature: v1=<hex-hmac-sha256>`. Consumers verify the
signature before parsing, reject timestamps outside five minutes, and dedupe
event IDs.

**Recommended.** Deliver at least once. Treat any 2xx as acknowledgement; use
bounded exponential backoff with jitter, record every delivery, disable
persistently failing endpoints after the documented threshold, and retain a
manual replay operation. Ordering is guaranteed only per resource through a
monotonic `resourceVersion`; consumers must tolerate duplicates and
out-of-order delivery.

**Recommended.** Polling is required in v1 and webhooks are optional. Defer SSE
until there is measured interactive-client demand and infrastructure for
connection budgets and replay via `Last-Event-ID`.

## SDK and documentation plan

**Recommended.** Generate a TypeScript SDK for the external pilot from the
reviewed OpenAPI document. It should provide typed discriminated profile
inputs, automatic problem parsing, cursor iterators, idempotency-key helpers,
poll-with-backoff helpers, and webhook signature verification. It must not
wrap CLI commands or expose provider structures.

**Recommended.** Add one non-TypeScript SDK only after contract stability and
customer demand. Generate examples and reference docs from the same OpenAPI
operations, but hand-write workflow guides explaining asynchronous status,
approval, safe publication, and webhook replay.

## MVP challenge and recommendation

**Inferred.** The nominal product scope (project/channel configuration,
episode creation, full production, assets, approval, publishing, and webhooks)
is commercially coherent but cannot safely be an external API on top of the
current `apps/api` wrapper. There is no evidenced request authentication,
tenant boundary, public contract, shared application composition root, or
distributed state authority in that app.

**Recommended.** Distinguish four release gates:

### API MVP (internal, contract proving)

1. Create/read a project and typed episode.
2. Start one `episode-production` workflow through shared application use
   cases, returning `202`.
3. Poll job/workflow status and list immutable generated assets.
4. Record one hash/revision-bound approval.
5. No public internet exposure, customer credentials, webhooks, or publishing.

### External pilot

1. OIDC/service-account authentication and workspace authorization.
2. Tenant-safe asset upload/download and channel credential isolation.
3. One entitled profile workflow end to end; preserve both profile variants in
   the contract and application boundary.
4. Signed webhooks.
5. Approved publication with the ambiguity-safe state machine above.
6. Rate limits, quotas, audit access, support runbook, and reconciliation UI or
   operator command.

### General availability

1. Both profile workflows characterized and supported.
2. Versioned SLA/SLOs, durable multi-worker execution, disaster recovery, key
   rotation, webhook replay, stuck-job detection, and contract compatibility
   policy.
3. Stable SDK, usage export, quota administration, and abuse controls.
4. Demonstrated crash-injection tests around every external side effect,
   especially YouTube acceptance and playlist assignment.

### Later features and explicit non-goals

- Later: SSE, GraphQL read projection, customer-authored workflow templates,
  more grades, additional providers, billing, bulk workflow creation.
- Non-goal for v1: public low-level task execution, arbitrary prompts/provider
  payloads, arbitrary local/remote URLs, filesystem browsing, CLI flag
  passthrough, synchronous rendering/publishing, automatic retry of ambiguous
  uploads, or generic domain fields that erase Dark Truth/math semantics.

**Unresolved.** Choose the first external-pilot profile using customer demand
and characterization evidence. The repository proves typed registries for
both but does not prove which has the stronger commercial cohort. Entitlements
should permit launching one profile without changing the public union or
creating a separate API.

## Critical application interfaces implied by the contract

**Recommended.** Extract these transport-independent, tenant-aware application
use cases before substantive controllers:

```ts
interface EpisodeUseCases {
  createEpisode(
    command: CreateEpisodeCommand,
    context: ActorContext
  ): Promise<Episode>;
  getEpisode(query: GetEpisodeQuery, context: ActorContext): Promise<Episode>;
}

interface WorkflowUseCases {
  startEpisodeProduction(
    command: StartEpisodeProductionCommand,
    context: ActorContext
  ): Promise<AcceptedJob>;
  getWorkflowRun(
    query: GetWorkflowRunQuery,
    context: ActorContext
  ): Promise<WorkflowRunView>;
  resumeWorkflow(
    command: ResumeWorkflowCommand,
    context: ActorContext
  ): Promise<AcceptedJob>;
  cancelWorkflow(
    command: CancelWorkflowCommand,
    context: ActorContext
  ): Promise<AcceptedJob>;
}

interface ApprovalUseCases {
  recordApproval(
    command: RecordApprovalCommand,
    context: HumanActorContext
  ): Promise<Approval>;
  revokeApproval(
    command: RevokeApprovalCommand,
    context: HumanActorContext
  ): Promise<Approval>;
}

interface PublicationUseCases {
  requestPublication(
    command: RequestPublicationCommand,
    context: ActorContext
  ): Promise<AcceptedJob>;
  reconcilePublication(
    command: ReconcilePublicationCommand,
    context: OperatorContext
  ): Promise<Publication>;
}
```

**Recommended.** `ActorContext` always includes principal, workspace,
permissions, request/correlation/causation IDs, and idempotency command ID.
Controllers validate public schemas and call exactly one use case. Use cases
authorize and transact commands, then invoke the canonical workflow and ports.
Workers claim commands and call the same use cases/handlers; they do not call
HTTP controllers or CLI parsers.

## Open questions for the lead decision register

- **Unresolved.** OpenAPI authoring/runtime validation framework.
- **Unresolved.** First external pilot profile and customer workflow.
- **Unresolved.** OIDC issuer/Keycloak deployment; no existing application
  integration was found in the inspected source.
- **Unresolved.** Retention/support windows for idempotency responses, events,
  and API versions.
- **Unresolved.** Whether YouTube resumable session initiation/status can be
  exposed reliably by the selected client; otherwise ambiguous uploads must
  always enter operator reconciliation.
- **Unresolved.** Exact public channel credential-connection UX and whether
  customers bring their own YouTube OAuth client.
- **Unresolved.** Whether workflow templates are workspace-configurable in v1;
  recommendation is server-managed/read-only.

## Lead-agent synthesis points

1. Prefer shared application/workflow use cases in a modular monolith; retain a
   future service boundary.
2. Replace the current API workspace-path response before any exposure.
3. Keep the public API high level, asynchronous, OpenAPI-first, and explicitly
   typed per content profile.
4. Treat job acceptance idempotency and external-side-effect exactly-once
   safety as separate layers.
5. Make an ambiguous YouTube outcome stop for reconciliation; never trade
   availability for duplicate-publication risk.
6. Ship polling first, signed webhooks for the pilot, and SSE later.
7. Do not expose low-level tasks, files, provider payloads, or CLI commands.
