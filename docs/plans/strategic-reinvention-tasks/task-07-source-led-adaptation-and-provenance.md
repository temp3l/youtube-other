# Task 07: Source-Led Adaptation And Provenance Reports

## Objective

Adapt approved human-authored material without open-ended ghostwriting or unsupported first-person content.

## Dependencies And Parallelism

Depends on Tasks 04 and 05. Safe in parallel with Task 08.

## Exclusive Ownership

- `packages/strategic-reinvention/src/source-adaptation.ts`
- `packages/strategic-reinvention/src/provenance-validation.ts`
- adaptation prompt/schema modules and focused tests in that package

Do not edit locale media packages, task registry, workflow engine, or CLI.

## Required Behavior

- Inputs: approved source manifests/content, genre, creator, blueprint, and effective policy.
- Outputs: candidate canonical script, beat/source map, claims, quotations, unsupported inferences, sensitivity warnings, and premium leakage report.
- Every beat has a stable ID and at least one approved source ID.
- Every first-person line traces to creator-authored source evidence.
- Structural condensation is permitted; invented experiences, opinions, memories, claims, advice, or brand wordplay fail.
- Candidate output remains unpublishable before canonical-script approval.

## Verification

```bash
pnpm test:focused -- packages/strategic-reinvention/src/source-adaptation.unit.test.ts
pnpm test:focused -- packages/strategic-reinvention/src/provenance-validation.unit.test.ts
```

## Acceptance

Unsupported first person, missing beat sources, premium leakage, unapproved quotes, and uncertain claims fail deterministically with machine-readable reasons.

Lead checkpoint: `feat(strategy): add source-led adaptation provenance`.
