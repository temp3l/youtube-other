# VJ-07 — Review, Approve, Reject, and Remediate

## Primary actor
Editor / Reviewer

## Main flow
1. System assembles an approval pack for a production revision.
2. Pack contains narration, scene plan, source lineage, generated/reused assets, language variants, timing, diagnostics, and render previews where available.
3. Reviewer can approve the full revision or reject specific artifacts/stages.
4. Rejection requires a structured reason/category and optional note.
5. System maps rejection to the smallest valid invalidation scope.
6. Remediation creates a new revision rather than mutating approved history.
7. Reviewer compares old/new artifacts and sees which inputs changed.
8. Approval records actor, timestamp, revision hashes, and policy version.

## Success outcome
Human review is efficient, auditable, and does not trigger unrelated regeneration.
