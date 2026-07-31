# Task 14: Usage, Audit, Quotas, And Security Gate

## Objective

Add the operational and abuse controls required before an external tenant pilot.

## Scope

- persist append-only usage, corrections, immutable audit, and correlation/causation chains
- reserve, settle, and release provider budgets transactionally
- enforce approved workspace/principal spend, concurrency, storage, batch, and publication limits
- treat source documents as untrusted data; prevent source-directed tools, URLs, policies, or credential access
- harden uploads, renderer isolation, egress, redaction, retention, key rotation, backup/restore, alerts, and incident runbooks

## Tests And Verification

Add concurrent-reservation, retry accounting, secret-canary, prompt-injection, malicious-upload, renderer-exhaustion, audit-tamper, restore, and rotation tests/drills.

## Acceptance Criteria

Pilot caps fail closed, provider retries are separately attributable, audit facts are immutable, and the security release gates in the threat model pass.
