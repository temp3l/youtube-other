# Task 01: Italian Locale, Domain, And Path Contracts

## Objective

Add Italian and the generic Strategic Reinvention contracts without changing existing profile defaults or legacy path behavior.

## Dependencies And Parallelism

Depends on Task 00. Safe in parallel with Task 02.

## Exclusive Ownership

- `packages/domain/src/content-policy-contracts.ts` and its new unit test
- `packages/domain/src/index.ts`
- `packages/domain/src/workflow-contracts.ts` and its unit test
- `packages/shared/src/episode-filesystem.ts` and its unit test
- `packages/shared/src/artifact-path-resolver.ts` and its unit test

Do not edit config, workflow engine, CLI, profile, or capability packages.

## Required Behavior

- Add `it` to generic locale schemas and add `strategic-reinvention` to the content-profile union.
- Define strict Zod contracts for genre, creator, effective policy, source, blueprint, reports, and multilingual package identity.
- Preserve schema v1 import shapes but define corrected internal v1.1 normalization targets.
- Add resolver keys for sources, blueprint, provenance, composition, audio tracks, capability reports, and publish packages.
- Preserve every existing path result and profile default.

## Verification

```bash
pnpm test:focused -- packages/domain/src/workflow-contracts.unit.test.ts
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- packages/shared/src/artifact-path-resolver.unit.test.ts
```

## Acceptance

Existing five-locale fixtures are byte-for-byte stable; `it` supports full/Short canonical intent; weak/unknown fields fail parsing; no strategic file overwrites a source.

Lead checkpoint: `feat(domain): add Italian strategic content contracts`.
