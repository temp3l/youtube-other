# History V3.4 semantic visual-planning hardening

Date: 2026-08-06

## Summary

Implemented additive `history-visual-plan.v3.4` / `history-visual-planner.v3.4.0` / `history-approval-pack.v3.4` with a single canonical `claim-*` namespace, typed entities/qualifiers, curated place authority, modality-complete map/diagram/timeline/document states, semantic beat grouping, multi-shot planning, ratio-specific adaptations, and honest four-gate approval. Regenerated review packs for episodes 02–05; Franklin ZIP is ready for ChatGPT upload.

## Root causes addressed

- Dual claim namespaces and stopword/temporal-prefix “entities”
- Placeholder map coordinates and malformed actors/routes
- Dangling map/diagram/timeline modality references
- One-unit→one-beat→one-shot mechanical planning
- Unenforced duplication metrics and generic ratio plans
- Overstated approval via generic `valid: true`

## Changed files (by workstream)

- Contracts: `packages/history/src/history-v34-contracts.ts`
- Claims/entities: `packages/history/src/history-claims-v34.ts`
- Geo/maps: `packages/history/src/history-geo-v34.ts`
- Planner/approval: `packages/history/src/visual-planner-v34.ts`
- Workflow/packs: `packages/history/src/history-workflow-v34.ts`
- Exports/CLI: `packages/history/src/index.ts`, `apps/cli/src/history-commands.ts`, `apps/cli/src/index.ts`
- Tests: `packages/history/src/history-v34.unit.test.ts`

## Authority boundary

OpenAI may only propose bounded semantics when `--semantic-structuring` is explicitly enabled (currently fail-closed offline). Application code owns IDs, spans, places/coordinates, graph validity, timing, hashes, and approval. Default remains `trusted-script` with no research/web search.

## Validation

- `pnpm --filter @mediaforge/history typecheck` pass
- `pnpm --filter @mediaforge/history build` pass
- focused ESLint on touched files pass
- `pnpm test:focused -- packages/history/src/history-v34.unit.test.ts` 5/5
- Dual Phase B ZIP hashes matched per episode

## Episode results

| Episode | Claims (non-mat) | Ent/Rej | Beats/Shots | Map/Diag/TL | ShotDup | Gates S/E/C/P | ZIP SHA-256 prefix |
|---|---|---|---|---|---|---|---|
| 02 Napoleon | 94 (5) | 125/31 | 50/74 | 0/2/3 | 0.865 | reviewable/blocked/blocked/blocked | `27b42e028cd1…` |
| 03 Rome | 106 (7) | 120/48 | 55/86 | 0/0/9 | 0.930 | reviewable/blocked/blocked/blocked | `c0691937c00b…` |
| 04 Black Death | 96 (4) | 101/31 | 48/70 | 0/0/1 | 0.900 | reviewable/blocked/blocked/blocked | `073fc93abdc7…` |
| 05 Franklin | 92 (8) | 90/52 | 68/81 | 1/0/4 | 0.889 | reviewable/blocked/blocked/blocked | `f0e23c14ecc2…` |

Franklin survivor-march map: actor `surviving expedition members`, leaders Crozier/Fitzjames, destination Back River, overland, real coordinates (no `[0,0]`/`[1,1]`). No bad entities (`The`/`In May`/…). No dangling modalities. Single claim namespace only.

Combined comparison: `artifacts/chatgpt-review/history-approval-packs-v3.4.zip` SHA-256 `bba2521bb87ef44851416234580f98be0c1a8af2b2b316092c64d4dfb502d255`.

## Remaining limitations

- Editorial/content blocked by enforced repetition thresholds (honest; not auto-approved).
- Production blocked until measured audio exists.
- Map coverage sparse outside Franklin (curated gazetteer + narration cues); invalid maps fall back safely.
- `--semantic-structuring` is wired but live OpenAI structuring remains fail-closed offline/CI.
- Trusted-script episodes are not independently historically verified.

## Franklin upload path

`artifacts/chatgpt-review/history-youtube-history-10-video-story-pack-05-franklin-expedition-v3.4.zip`
