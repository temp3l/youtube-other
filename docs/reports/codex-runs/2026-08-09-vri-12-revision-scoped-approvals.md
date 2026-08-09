# VRI-12 revision-scoped approvals, review packs, and remediation

- Date: 2026-08-09

## Changed files

- `packages/workflow-engine/src/review-pack.ts`
- `packages/workflow-engine/src/workflow-store.ts`
- `packages/workflow-engine/src/workflow-store.unit.test.ts`
- `packages/workflow-engine/src/index.ts`

## Checks run

- `pnpm test:focused -- packages/workflow-engine/src/workflow-store.unit.test.ts` — 15 passing.
- `pnpm --filter @mediaforge/workflow-engine typecheck` — passing.

## Results

The shared workflow store now persists immutable, current-revision review-pack evidence with canonical profile identity, artifact/input hashes, configuration and dependency fingerprints, provenance, reuse rationale, and bounded remediation. Delta packs identify changed versus preserved artifacts and redact failure evidence before it can leave the workflow boundary. Scoped approval history remains the authoritative approval mechanism; review packs do not dispatch providers or publish content.

## Risks remaining

The API/CLI review routes are intentionally deferred to their planned parity and orchestration tasks. Existing legacy review packs remain readable but are not promoted to this strict v1 evidence contract.

## Follow-up tasks

- Wire the canonical workflow orchestrator and API/CLI routes to record and present review-pack deltas.
