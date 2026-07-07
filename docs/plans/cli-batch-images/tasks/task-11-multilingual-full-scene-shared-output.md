# Task 11 - Multilingual Full-Scene Shared Output

Recommended model: GPT-5.4 for planner and manifest policy work; GPT-5.4-mini for targeted test iteration.

Commit after implementation: `fix(image-batch): enforce multilingual full-image output policy`

## Objective

Resolve the remaining full-scene multilingual output ambiguity by introducing an
explicit shared-output policy that allows safe aliases and rejects conflicting
same-path writes.

## Background

Full-scene outputs currently target shared canonical paths under
`shared/images/generated/`. The planner currently rejects multiple languages in
one run because those paths collide, even when two languages are effectively
requesting the same image. The remaining gap is not path normalization; it is
how to represent safe sharing without duplicate paid requests or ambiguous
imports.

## Scope

- Define and implement the full-scene shared-output policy.
- Detect duplicate destination paths across languages.
- Allow same-path duplicates only when they are provably safe shared-output
  aliases.
- Represent alias relationships in the manifest.
- Ensure import, retry, and renderer resolution all behave correctly for owner
  and alias items.

## Out of scope

- No fallback to legacy localized full-image layouts.
- No broad renderer redesign outside alias-aware path consumption.

## Dependencies

Task 10.

## Repository evidence

- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/image-batch.schemas.ts`
- `packages/image-generation/src/image-batch.types.ts`
- `packages/rendering/src/index.ts`
- `packages/image-generation/src/image-batch-planner.unit.test.ts`
- `packages/image-generation/src/image-batch-service.unit.test.ts`

## Required changes

- Add a shared-output decision point such as `sharedOutputPolicy`.
- Compare multilingual same-path candidates using at least:
  - `providerRequestHash`
  - `generationConfigurationHash`
  - operation
  - output format
  - dependency hashes
- If candidates are identical, pick one deterministic owner item and mark the
  others as aliases.
- Emit provider JSONL only for owner items.
- If candidates differ, reject preparation before any write or submission.
- Update import so owner results populate alias items consistently.
- Update retry logic so alias items do not create duplicate paid requests.
- Keep canonical full-scene paths shared when aliasing is safe.

## Data model or manifest changes

- Extend manifest items with explicit alias metadata, such as:
  - whether the item owns the shared output
  - which `customId` it aliases, if any
  - a stable shared-output key
- Schema-validate any new manifest fields.

## CLI behavior

- `images batch prepare --variants full --languages en,de` may succeed only when
  same-path collisions are proven safe aliases.
- Unsafe same-path collisions must fail during preparation with a clear error.

## Error handling and observability

- Report duplicate destination rejection with enough detail to show the
  colliding languages and identities.
- Surface alias counts in prepare/download summaries if that fits the existing
  JSON shape without breaking current consumers.

## Security and cost controls

- Safe aliasing must reduce paid duplication rather than increase it.
- Retries must never resubmit alias followers independently.

## Tests

- English and German safely share a full-scene image when request identity is
  identical.
- English and German require distinct outputs when prompts or dependencies differ.
- Accidental same-path duplicates are rejected.
- Alias-aware import updates all linked items consistently.
- Alias-aware retry submits only owner items.
- Renderer lookup succeeds when a shared full-scene path is owned by one item and
  referenced by aliases.

## Verification commands

```bash
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm test:focused -- packages/rendering/src/index.unit.test.ts
```

## Acceptance criteria

- Multilingual full-scene output policy is explicit in code and manifests.
- Safe shared outputs avoid duplicate provider requests.
- Unsafe path collisions fail before submission.
- Import, retry, and rendering handle aliases consistently.

## Rollback considerations

- Alias metadata must be local to the batch manifest and planner logic so it can
  be reverted without deleting canonical shared assets.
