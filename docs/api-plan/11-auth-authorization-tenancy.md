# Authentication, Authorization, and Tenancy

## Evidence and conclusion

- **Verified:** `apps/api/src/index.ts:startApiServer` returns runtime workspace configuration without authenticating a caller. It has no router, principal, or authorization check.
- **Verified:** `scripts/youtube-auth.ts` and `packages/youtube-upload/src/index.ts:createYoutubeClient` implement Google/YouTube OAuth for channel access. This is a provider credential flow, not user authentication.
- **Verified:** no Keycloak, OIDC, JWT validation, API-key store, tenant identifier, or authorization policy is present in application source (`rg` over `apps`, `packages`, `config`, and `scripts`, 2026-07-31).
- **Verified:** current persistence is one SQLite `episodes` table keyed only by `episode_id` (`packages/persistence/src/index.ts:SQLitePersistence.migrate`).
- **Verified:** workflow, asset, and episode stores derive authority from caller-supplied local roots; for example `packages/workflow-engine/src/workflow-store.ts:WorkflowStore` and `packages/shared/src/episode-filesystem.ts:createEpisodePathResolver`.
- **Recommended:** treat every persisted business row, object key, idempotency record, queue message, audit event, and credential reference as workspace-scoped. The API must never infer workspace ownership from a path.

## Principal model

| Principal       | Authentication                                                        | Intended use                                     |
| --------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| Human user      | OIDC authorization code + PKCE; short-lived access token              | Web/interactive administration and approval      |
| Service account | OAuth 2.0 client credentials through the same identity authority      | Trusted server integrations and schedulers       |
| Scoped API key  | Random opaque key, stored only as a salted slow hash; optional expiry | External pilot and simple automation             |
| Worker          | Workload identity or narrowly scoped internal JWT/mTLS identity       | Claim and execute jobs; never a public principal |

- **Recommended:** integrate with the operator-selected OIDC provider through issuer discovery and JWKS validation. Repository evidence does not establish Keycloak specifically.
- **Recommended:** issue API keys to service-account principals, not directly to an unowned workspace. Show the secret once; store prefix, hash, scopes, workspace, creator, expiry, and last-used time.
- **Recommended:** do not accept provider credentials in ordinary workflow requests.

## Tenant boundary

`workspace_id` is the tenant boundary. A user may have memberships in multiple workspaces, but every request resolves exactly one workspace from a path-bound resource or explicit `/v1/workspaces/{workspace_id}` parent. Authorization is evaluated on the database record before storage or provider access.

Required invariants:

1. Public identifiers are opaque UUIDv7/ULID-style IDs and reveal no filesystem location.
2. Repositories require `AuthorizationContext { principalId, workspaceId, permissions }`; no unscoped `findById`.
3. SQL queries include `workspace_id`; unique keys include it unless global uniqueness is intentional.
4. Object keys are server-generated from workspace and asset IDs. Signed URLs are short lived and bound to one object/method.
5. Queue envelopes carry IDs, never secrets or caller-controlled paths.
6. channel credential handles resolve through a tenant-scoped secret store only after a fresh authorization check.
7. cross-workspace support access is a separate, time-bounded, audited role; it is not an administrator shortcut.

## Permission vocabulary

| Permission                                                          | Representative actions                            |
| ------------------------------------------------------------------- | ------------------------------------------------- |
| `workspace.admin`                                                   | membership, service accounts, keys, quotas        |
| `content.read` / `content.write`                                    | projects, profiles, episodes, sources, references |
| `workflow.start` / `workflow.cancel`                                | launch and cancel runs                            |
| `render.execute`                                                    | costly render operations                          |
| `validation.read` / `validation.execute`                            | inspect or start validation                       |
| `approval.read` / `approval.decide`                                 | view and make attributable decisions              |
| `publication.read` / `publication.execute` / `publication.schedule` | publish or schedule approved artifacts            |
| `channel.credentials.manage`                                        | connect, rotate, or revoke YouTube credentials    |
| `webhook.manage`                                                    | endpoints and signing-secret rotation             |
| `audit.read`                                                        | immutable audit history                           |
| `usage.read`                                                        | usage and quota data                              |

- **Recommended:** default roles are Viewer, Creator, Operator, Approver, Publisher, and Workspace Admin. Publishing requires `publication.execute`; changing credentials requires `channel.credentials.manage`. A workspace may require different actors for approval and publication.
- **Recommended:** a queued publication rechecks current approval, permission policy, credential binding, artifact hashes, and channel target at execution time. Revocation therefore blocks queued work.

## Credential isolation

- Store Google refresh tokens and provider keys in a secrets manager or envelope-encrypted credential table; persist only a `credential_id` in business tables.
- Encryption context binds `{workspace_id, channel_id, credential_type}`. Workers receive short-lived decrypted material only for the claimed step.
- Redact authorization, cookies, access tokens, API keys, signed URLs, prompts marked sensitive, and provider response bodies. Existing Pino redaction in `packages/observability/src/index.ts:createLogger` is a useful baseline but is not a complete secret boundary.
- **Unresolved:** identity provider, enterprise federation requirements, and whether pilot API keys are allowed for publishing require operator approval.

## Authorization test matrix

Every resource test suite must cover owner success, same-workspace insufficient permission, other-workspace opaque `404`, revoked principal, deleted membership, expired key, and worker scope mismatch. Publication tests additionally cover approval revoked after enqueue and channel credential replaced after approval.
