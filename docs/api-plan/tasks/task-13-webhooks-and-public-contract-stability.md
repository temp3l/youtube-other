# Task 13: Webhooks And Public Contract Stability

## Objective

Deliver a coherent, language-neutral integration contract for asynchronous completion.

## Scope

- define one versioned event envelope containing event ID, type, occurred time, workspace, subject, `subject_version`, correlation, causation, and bounded data
- define one header/signature convention and event-name catalog
- implement transactional outbox delivery, retries, dead letters, endpoint disablement, replay, and secret rotation
- enforce HTTPS, DNS/IP revalidation, redirect policy, and outbound size/time limits
- generate a TypeScript SDK with polling, problem parsing, idempotency, cursor, and webhook verification helpers

## Tests And Verification

Add duplicate-five-times, out-of-order, signature, rotation-overlap, replay, SSRF, redirect, retry, dead-letter, generated-SDK compile, and consumer-fixture tests.

## Acceptance Criteria

Consumers can deduplicate by event ID and order per subject version, and OpenAPI/event compatibility checks reject breaking wire changes.
