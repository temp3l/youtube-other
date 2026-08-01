# Task 04: Content Source Provenance And Rights

## Objective

Make creator source identity, content hashes, rights, sensitivity, access, and transformations first-class production gates.

## Dependencies And Parallelism

Depends on Task 03. Safe in parallel with Tasks 05 and 06.

## Exclusive Ownership

- `packages/source-ingestion/src/index.ts` and new focused tests/modules
- `packages/strategic-reinvention/src/source-policy.ts` and tests
- source-manifest fixture data owned by this task

Do not edit workflow approvals, visual planning, or adaptation modules.

## Required Behavior

- Compute stable SHA-256 from canonical source bytes, not mutable manifest fields.
- Enforce rights status, allowed use, transformation, locale, commercial use, expiry, access tier, sensitivity, approver, and approval time conjunctively.
- Persist through resolver-selected source paths with atomic writes and containment.
- Block unknown, permission-required, blocked, expired, high-risk, private, confidential, and premium-to-public cases as specified.
- Emit IDs/hashes/reason codes, never source text, in normal telemetry.

## Verification

```bash
pnpm test:focused -- packages/source-ingestion/src/content-source.unit.test.ts
pnpm test:focused -- packages/strategic-reinvention/src/source-policy.unit.test.ts
```

## Acceptance

The full rights matrix is deterministic; a byte change changes the hash; unclear rights cannot reach adaptation or publication; no manifest path escapes the episode.

Lead checkpoint: `feat(source): add rights-aware content manifests`.
