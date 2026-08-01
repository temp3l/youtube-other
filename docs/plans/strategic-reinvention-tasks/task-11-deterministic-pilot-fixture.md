# Task 11: Deterministic Pilot Fixture

## Objective

Prove the accepted workflow contract end to end without paid providers or live publication.

## Dependencies And Parallelism

Depends on Tasks 09 and 10. Safe in parallel with Task 12.

## Exclusive Ownership

- new fixtures under `packages/strategic-reinvention/src/__fixtures__/pilot/`
- new `packages/strategic-reinvention/src/pilot.integration.test.ts`
- mock-provider helpers owned by the strategic package

Do not update existing broad snapshots or generated episode assets.

## Required Scenario

- creator `veronica-benini`, genre `strategic-reinvention`;
- approved Italian source and full script;
- Italian Short;
- English and Spanish localizations;
- mock narration, visual assets, captions, metadata, CTA, render evidence, and upload package;
- all required approvals including a high-risk two-reviewer example;
- resume from a partial stage;
- source-byte change and downstream invalidation;
- unsupported alternate-audio capability and dry-run-only publication.

## Verification

```bash
pnpm test:focused -- packages/strategic-reinvention/src/pilot.integration.test.ts
```

## Acceptance

Two clean runs are deterministic apart from explicitly normalized timestamps/IDs; resume performs no duplicate completed work; source change invalidates all expected descendants; provider mutation count remains zero.

Lead checkpoint: `test(strategy): add deterministic Veronica pilot`.
