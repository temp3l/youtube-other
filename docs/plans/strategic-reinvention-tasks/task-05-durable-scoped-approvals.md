# Task 05: Durable Scoped Approvals

## Objective

Extend the canonical approval domain for editorial stages, locale scope, invalidation, and two-person high-risk review.

## Dependencies And Parallelism

Depends on Task 03. Safe in parallel with Tasks 04 and 06.

## Exclusive Ownership

- approval-related contracts in `packages/domain/src/workflow-contracts.ts`
- `packages/workflow-engine/src/workflow-store.ts` and approval-focused tests
- approval persistence in `packages/persistence/src/`
- new `apps/cli/src/approval-commands.ts` and test
- CLI registration only after lead assigns the relevant `apps/cli/src/index.ts` hunk

## Required Behavior

- Support source, canonical-script, localization, voice, metadata, render-QA, and publish gates.
- Bind actor, time, workflow revision, input/output hashes, locale/variant, notes, and expiry.
- Require distinct actors for high-risk review.
- Revoke/invalidate downstream gates on source changes; keep metadata-only invalidation narrow.
- Append structured audit events without secrets/source text.
- Implement status/grant/reject/revoke with stable JSON output.

## Verification

```bash
pnpm test:focused -- packages/workflow-engine/src/workflow-store.unit.test.ts
pnpm test:focused -- packages/persistence/src/postgres-episode-approval-persistence.unit.test.ts
pnpm test:focused -- apps/cli/src/approval-commands.unit.test.ts
```

## Acceptance

Stale/revoked/wrong-locale approvals never satisfy a gate; one actor cannot satisfy two-person review; CLI actions always append an attributable event.

Lead checkpoint: `feat(approval): add scoped creator workflow approvals`.
