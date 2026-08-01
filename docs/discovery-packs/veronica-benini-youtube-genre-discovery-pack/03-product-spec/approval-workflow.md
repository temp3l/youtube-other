# Approval Workflow

## State machine

```text
SOURCE_DRAFT
  → SOURCE_APPROVED
  → CANONICAL_SCRIPT_ADAPTED
  → CANONICAL_SCRIPT_APPROVED
  → LOCALIZED
  → LOCALIZATION_APPROVED
  → VOICE_APPROVED
  → RENDERED
  → QA_APPROVED
  → PUBLISH_APPROVED
  → SCHEDULED
  → PUBLISHED
```

## Blocking states

```text
RIGHTS_BLOCKED
SENSITIVITY_BLOCKED
EDITORIAL_REJECTED
LOCALIZATION_REJECTED
VOICE_REJECTED
QA_REJECTED
PUBLISH_REVOKED
```

## Rules

1. No stage may infer approval from the existence of an output file.
2. Every approval records:
   - approver;
   - timestamp;
   - input fingerprint;
   - approved output fingerprint;
   - notes;
   - scope and locales.
3. Changing an upstream source invalidates all downstream approvals.
4. Changing only metadata invalidates metadata and publish approval, not the render.
5. A rights expiry invalidates publication authority immediately.
6. A high-risk sensitivity flag requires a second human reviewer.
7. `autoPublish` remains false.
8. Approval is locale-specific for scripts, voice, metadata and thumbnails.
9. The uploader must require an explicit `PUBLISH_APPROVED` grant matching the exact
   render and metadata fingerprints.
10. Duplicate upload protection must use channel, locale strategy, video fingerprint
    and campaign identifier.

## Suggested approval record

```json
{
  "approvalId": "appr_...",
  "episodeId": "episode-slug",
  "stage": "CANONICAL_SCRIPT_APPROVED",
  "locale": "it",
  "status": "approved",
  "approver": "veronica-benini",
  "inputFingerprint": "sha256:...",
  "outputFingerprint": "sha256:...",
  "approvedAt": "2026-07-31T12:00:00Z",
  "notes": "Approved with terminology corrections."
}
```

## CLI behavior

Suggested commands:

```bash
mediaforge approvals status <episode-id>
mediaforge approvals grant <episode-id> --stage source --locale it
mediaforge approvals grant <episode-id> --stage script --locale it
mediaforge approvals reject <episode-id> --stage localization --locale es
mediaforge approvals revoke <episode-id> --stage publish
```

All commands should support `--json` and produce structured audit events.
