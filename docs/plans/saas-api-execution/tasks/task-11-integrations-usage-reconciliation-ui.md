# Task 11: Integrations, Usage, And Reconciliation UI

## Objective

Give workspace operators bounded visibility and administration for API access,
webhooks, quotas/usage/audit, and uncertain publication recovery.

## Depends On

Tasks 04 and 06–10.

## Scope

- Render quota status, append-only usage records, and audit-event pagination.
- Add API-key issue/rotate/revoke and webhook endpoint/replay UI only if Task 00
  approves those operations for the pilot contract; show secrets once.
- Add reconciliation list/detail/operator-action flows over safe application use cases.
- Enforce admin permissions, reauthentication for sensitive actions, bounded filters,
  redaction, idempotency, and immutable audit facts.
- Make publication execution controls absent until Task 14 is complete.

## Out Of Scope

Billing/invoices, arbitrary webhook payload editing, plaintext secret persistence,
blind retry, and support impersonation.

## Acceptance

- Secret values never reappear after their one-time response.
- Replayed webhooks remain signed, idempotent, and auditable.
- Reconciliation never guesses a provider outcome or triggers publication.
- Permission, redaction, pagination, rotation, and UI-state tests pass.

## Reports

Create the plan implementation report and Codex run report required by the pack README.
