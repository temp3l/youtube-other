# Grounded modality baseline remediation

## Git checkpoints

| Role | Tag | SHA |
|------|-----|-----|
| Accepted semantic baseline | `history-v3.5-semantic-baseline` | `aae72a565c4cf00e9b61576fc04f06e1a9a0fe73` |
| Over-segmentation experiment | `history-v3.5-modality-experiment-overseg` | `59e37077827605c90f4dd605641cd1089dbae23b` |
| Under-segmentation experiment | `history-v3.5-modality-experiment-underseg` | `6e47409da45f599fa47d09dbb56805797fa01c27` |
| **Grounded remediation** | `history-v3.5-grounded-modality-baseline` | `c24dac9` |

## Root causes

### Diagram leakage / unsupported content
- `compileBronzeTradeDiagramV35` / `compileBronzeSystemsCollapseDiagramV35` used loose label filters (`/trade|palace|military/`) that matched unrelated episodes (Constantinople, Angkor).
- Broad bronze compile gate in `compileDiagram()` triggered on Mediterranean geography + generic trade tokens.
- Diagram registry reused states by render signature without verifying claim-window identity.

### Over-segmentation (`59e3707`)
- Expanded `modalityFor()` map regex plus `map` anti-merge blocking in `clusterBeats()` inflated beat count (~2119).

### Under-segmentation (`6e47409`)
- `segmentationModalityFor()` deferred maps to archival during clustering and removed `map` from anti-merge, over-merging beats (~1782) and reducing geo-fact/map propagation.

## Repair

- Restored baseline `clusterBeats()` ownership (`modalityFor` + `map` anti-merge).
- Added `history-diagram-provenance-v35.ts` with episode-local claim, node, and question grounding.
- Tightened bronze diagram compilers to `isClaimGroundedDiagramLabelV35` only.
- Registry reuse requires matching claim-window identity.
- UTC timestamped approval-pack paths (`YYYYMMDDTHHMMSSZ`) + `approval-pack-provenance.json`.
- Corpus acceptance enforces zero diagram-provenance violations on valid diagrams.

## Corpus metrics (40 episodes, post-remediation)

| Metric | Semantic baseline | Over-seg | Under-seg | **Repaired** |
|--------|------------------:|---------:|----------:|-------------:|
| Visual beats | ~1985 | ~2119 | ~1782 | **1940** |
| Maps (valid) | 54 | 69 | 48 | **56** |
| Locator / sequence / movement | 9 / 43 / ~1 | 24 / 43 / 0 | — | **17 / 38 / 1** |
| Diagrams (valid) | 29 | 29 | 32 | **27** |
| Geographic qualifiers | 583 | 583 | 583 | **583** |
| Viewer repetition | ~8.74% | ~8.61% | ~8.07% | **8.37%** |

Diagram provenance: **0** cross-episode claim refs, **0** ungrounded valid nodes/questions on corpus pass.

## Tests

- `history-diagram-provenance-v35.unit.test.ts` — 6/6 pass
- `history-episode-discovery.unit.test.ts` — 4/4 pass
- `history-visual-modality-v35.unit.test.ts` — 8/8 pass
- `history-diagram-compile-v35.unit.test.ts` — 9/9 pass
- `history-entity-resolution-v35.unit.test.ts` — 55/55 pass
- `history-v35-corpus.acceptance.ts` — pass
- `@mediaforge/history` typecheck — pass

## Files changed

- `packages/history/src/history-diagram-provenance-v35.ts` (new)
- `packages/history/src/history-diagram-provenance-v35.unit.test.ts` (new)
- `packages/history/src/history-approval-pack-provenance-v35.ts` (new)
- `packages/history/src/history-diagram-semantic-v35.ts`
- `packages/history/src/history-diagram-compile-v35.ts`
- `packages/history/src/history-diagram-topology-v35.ts`
- `packages/history/src/visual-planner-v35.ts`
- `packages/history/src/history-episode-discovery.ts`
- `packages/history/src/history-workflow-v35.ts`
- `packages/history/src/history-approval-pack-range.ts`
- `packages/history/test/acceptance/history-v35-corpus.acceptance.ts`

## Artifacts

- Pack: `artifacts/chatgpt-review/history-approval-packs-v3.5-episodes-01-40-20260808T140840Z.zip`
- Pack SHA-256: `e186f7806199243615c5c588c2998e4810897fe35e39481699f796fd351bf31f`
- Provenance: `approval-pack-provenance.json` inside pack directory (git SHA `c24dac9`, baseline `aae72a56`)
