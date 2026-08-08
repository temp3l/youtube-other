# History V3.5 semantic hardening

## Summary
Hardened entity resolution, diagram registry dedup, and state-bound evidence closure; regenerated episodes 03/04/06/08/10 (plus 07/09 after pack wipe recovery) and rebuilt the 01–10 approval ZIP.

## Changed files
- `packages/history/src/history-entity-resolution-v35.ts` (new)
- `packages/history/src/history-state-evidence-closure-v35.ts` (new)
- `packages/history/src/history-entity-resolution-v35.unit.test.ts` (new)
- `packages/history/src/history-claims-v34.ts`
- `packages/history/src/history-effective-change-v35.ts`
- `packages/history/src/history-diagram-topology-v35.ts`
- `packages/history/src/visual-planner-v35.ts`
- `packages/history/src/history-geo-v34.ts`
- `packages/history/test/acceptance/history-v35-corpus.acceptance.ts`
- `scripts/history-v35-combine-ten-episode-pack.mjs`

## Tests
- `pnpm test:focused -- packages/history/src/history-entity-resolution-v35.unit.test.ts` — pass (8)
- `pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts` — pass

## Artifact
- `artifacts/chatgpt-review/history-approval-packs-v3.5-episodes-01-10.zip`
- SHA-256: `e7b22558b0c247dcea9beefb481670ed4cb6074e0fb8a96402f17be57e09b8c9`

## Risks / follow-up
- Titanic long-static share ~42.6% (advisory cadence pass deferred)
- Episodes 07/09 regenerated once after accidental output-dir wipe during combine
