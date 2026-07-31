# Task 15: Publication Safety And Reconciliation

## Objective

Publish to YouTube without blind duplicate uploads or approval/credential races.

## Scope

- transactionally create an immutable publication intent, effect records, idempotency result, job, and outbox
- acquire fenced channel/intent leases and enforce one active equivalent publication
- bind and recheck approval, actor policy, credential version, hashes, visibility, schedule, and playlists
- close the revocation race with a transactional transition to irreversible `executing`
- persist resumable-session/provider evidence before bytes where supported
- reconcile uncertain upload, thumbnail, playlist, and visibility effects independently
- require operator reconciliation when exact provider evidence is inconclusive

## Tests And Verification

Inject failure at every state/provider boundary, including approval revocation, database loss, late provider success, multiple recovery matches, and playlist partial success.

## Acceptance Criteria

Every test yields one proven video or `reconciliation_required`; no ambiguous outcome triggers a new upload, and revoked approval blocks before the irreversible cutoff.
