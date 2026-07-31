# REST API Contract `/v1`

## Protocol

- REST with OpenAPI 3.1; JSON by default and RFC 9457 `application/problem+json` errors.
- Long/paid/queued/render/provider/irreversible commands return `202 Accepted`, `Location`, `Retry-After`, and stable job/resource IDs.
- Cursor pagination: `page[size]` default 25, maximum 100, opaque authenticated `page[after]`, stable `(created_at,id)` ordering.
- Major version in path. Public schemas are explicit adapters, not generated directly from internal package types.

## Main operations

```http
POST /v1/workspaces/{ws}/projects
POST /v1/workspaces/{ws}/projects/{project}/channels
POST /v1/workspaces/{ws}/projects/{project}/content-sources
POST /v1/workspaces/{ws}/projects/{project}/story-bibles
POST /v1/workspaces/{ws}/projects/{project}/curriculum-sources
POST /v1/workspaces/{ws}/projects/{project}/assets:prepare-upload
POST /v1/workspaces/{ws}/projects/{project}/assets:complete-upload
GET  /v1/workspaces/{ws}/projects/{project}/assets/{asset}
POST /v1/workspaces/{ws}/projects/{project}/assets/{asset}:prepare-download

POST /v1/workspaces/{ws}/projects/{project}/episodes
GET  /v1/workspaces/{ws}/projects/{project}/episodes/{episode}
PATCH /v1/workspaces/{ws}/projects/{project}/episodes/{episode}
POST /v1/workspaces/{ws}/projects/{project}/episodes/{episode}/workflow-runs
GET  /v1/workspaces/{ws}/projects/{project}/workflow-runs/{run}
GET  /v1/workspaces/{ws}/projects/{project}/workflow-runs/{run}/steps
POST /v1/workspaces/{ws}/projects/{project}/workflow-runs/{run}:resume
POST /v1/workspaces/{ws}/projects/{project}/workflow-runs/{run}:cancel
GET  /v1/workspaces/{ws}/projects/{project}/jobs/{job}

POST /v1/workspaces/{ws}/projects/{project}/approvals
POST /v1/workspaces/{ws}/projects/{project}/approvals/{approval}:revoke
POST /v1/workspaces/{ws}/projects/{project}/publications
GET  /v1/workspaces/{ws}/projects/{project}/publications/{publication}
POST /v1/workspaces/{ws}/projects/{project}/publications/{publication}:cancel
```

Configuration/catalog lists, validation results, webhook endpoints, usage records, and audit events use conventional authorized GET/POST/PATCH operations described in `06-api-resource-model.md` and `13-events-and-webhooks.md`.

## Typed episode input

```json
{
  "content": {
    "type": "dark_truth",
    "version": "1",
    "premise": "...",
    "storyBibleId": "sb_...",
    "referenceAssetIds": ["ast_..."]
  }
}
```

or

```json
{
  "content": {
    "type": "mathematics_education",
    "version": "1",
    "curriculumSourceId": "cur_...",
    "skillId": "...",
    "grade": 5,
    "difficulty": "standard",
    "presentationPresetId": "pre_...",
    "audioPresetId": "pre_..."
  }
}
```

Start workflow input names high-level intent only: template `episode-production`, episode revision, locales, variants, approval mode, and initially `publicationMode: "none"`. No low-level task list.

Approval input names the server-issued challenge, subject, expected revision, decision, and reason. Actor and artifact hashes are server derived. Publication input binds approved render/metadata/thumbnail revisions, target, locale/variant, visibility/schedule, and playlists.

## Error shape

```json
{
  "type": "https://api.example/problems/idempotency-key-conflict",
  "title": "Idempotency key conflict",
  "status": 409,
  "detail": "The key was used with different parameters.",
  "code": "idempotency_key_conflict",
  "requestId": "req_...",
  "retryable": false,
  "errors": []
}
```

Status families: `400` parse/media; `401` authentication; `403` permission; opaque `404` for cross-tenant/missing; `409` state/idempotency/cancel conflict; `412` stale precondition; `422` semantic/profile/approval failure; `428` missing precondition; `429` quota/rate; `502/503` upstream/availability; redacted `500`.

## Compatibility and SDK

Additive fields/event types are allowed within v1 when clients preserve unknown values. Removing, renaming, narrowing, or changing semantics requires v2. Publish `/v1/openapi.json`, contract-diff it in CI, runtime-validate boundary fixtures, and generate a TypeScript SDK with problem parsing, cursor iterators, idempotency helpers, polling, and webhook verification.

**Unresolved:** HTTP framework/OpenAPI authoring tool, support window, and channel connection UX.
