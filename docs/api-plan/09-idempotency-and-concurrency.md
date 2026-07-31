# Idempotency and Concurrency

## HTTP command idempotency

- Require `Idempotency-Key` (1–255 printable ASCII) for paid, queued, approval, publication, and other externally mutating commands.
- Scope: `(workspace_id, principal_id, method, normalized_route)`.
- Fingerprint canonical validated body, path/query, method, and contract version; exclude auth/tracing/transport headers.
- First request atomically stores fingerprint, command/resource IDs, status/response, expiry, and outbox.
- Same key/fingerprint returns exact stored IDs/status/body with `Idempotency-Replayed: true`.
- In-progress acceptance returns `409 idempotency_request_in_progress` and the existing job.
- Same key/different fingerprint returns `409 idempotency_key_conflict` and executes nothing.
- Retain completed idempotency records for 30 days by default; use longer configured retention for publication and billing-sensitive commands. Retain publication-intent deduplication permanently. Reusing a key with a different fingerprint is a conflict.

## Optimistic concurrency and dedupe

Mutable resources carry monotonic revision and ETag. `PATCH`, approval, cancel, schedule change, and other stale-sensitive commands require `If-Match` (`428` absent, `412` stale). SQL uniqueness, not in-process locks, controls accepted commands. A workflow-start uniqueness policy uses episode revision + template + normalized inputs when product semantics call for dedupe.

Each batch item has a caller item key and server ID derived from the batch command; successful items never rerun on batch replay.

## External-effect journal

Every effect has deterministic `(publication_intent_id, operation, target_key)`, state, attempt, lease fence, request/session ID, response identity, and reconciliation result. An unknown result is `outcome_uncertain`, not retryable failure.

## Exact duplicate-publication design

1. Transactionally create immutable publication intent, idempotency row, effect rows, job, and outbox. Unique binding includes workspace, target channel, episode/content revision, locale, and variant.
2. Bind approval, credential version, render/thumbnail/metadata hashes, policy, schedule, and playlists. Any change needs a new approval/intent.
3. Publish worker holds a fenced channel/intent lease and rechecks all bindings.
4. Initiate a resumable upload and durably store the session/provider token before sending bytes where the YouTube protocol permits. Upload privately with a unique recovery marker.
5. Persist returned video ID/request evidence immediately before thumbnail, playlist, or visibility changes.
6. After crash/time-out with no video receipt, never blindly create another upload. Query/resume the session, then reconcile recent authenticated-channel videos by exact marker/fingerprint/window.
7. Exactly one match is bound; multiple or inconclusive results become `reconciliation_required`. Zero only permits retry after a provider-proven uncertainty policy.
8. Reconcile thumbnail and each playlist membership/receipt independently; checkpoint each.
9. Remove the marker/apply approved visibility or schedule only after all required receipts; commit success plus audit/outbox transactionally.

**Verified gap:** current `videos.insert` checkpoint occurs after provider success returns (`youtube-mutation-seam.ts:executeYoutubeMutationSequence`), and the active legacy uploader does not persist each intermediate mutation (`youtube-upload/src/index.ts`). **Unresolved:** prove recoverable YouTube session and marker semantics. Without proof, fail closed and require operator reconciliation.

See `diagrams/publishing-idempotency-sequence.mmd`.
