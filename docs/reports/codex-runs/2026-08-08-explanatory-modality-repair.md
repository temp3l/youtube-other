# Explanatory modality repair (V3.5)

## Checkpoints

| Tag | SHA |
|-----|-----|
| `history-v3.5-semantic-baseline` | `aae72a565c4cf00e9b61576fc04f06e1a9a0fe73` |
| `history-v3.5-modality-experiment-1` | `7fd52c75761b22228282db5917e7f24e293c1f7a` |
| `history-v3.5-modality-hardening-v2` | `6e47409` |

## Root causes

1. **Beat explosion (+134 beats, +132 archival intents):** Map regex expansion in `modalityFor()` plus `map` anti-merge in `clusterBeats()` inflated segmentation; map compile probes during clustering forced extra beats.
2. **Locator-map over-selection:** `scoreMapOpportunityV35` treated any compile success as map-worthy; single-place mentions won over archival.
3. **Diagram under-selection / blocked states:** Diagram reservation forced `diagram` modality without compile viability; bronze trade compile returned blocked graphs with `DIAGRAM_UNSUPPORTED_EDGE`.

## Repair

- `segmentationModalityFor()` defers map to archival during clustering (read-only segmentation).
- `assessMapOpportunityV35()` tiers explanatory vs locator; only explanatory maps compete.
- Bounded context windows for map/diagram scoring without beat mutation.
- `acceptCompiledDiagramV35()` rejects blocked diagram compiles; reservation requires diagram eligibility.
- Regression tests in `history-visual-modality-v35.unit.test.ts`.

## Corpus metrics (40 episodes)

| Metric | Semantic baseline (7) | Experiment (8) | Repaired |
|--------|----------------------:|---------------:|---------:|
| Visual beats | ~1,985 | ~2,119 | **1,782** |
| Maps (valid) | 54 | 69 | **48** |
| Locator maps | 9 | 24 | **15** |
| Sequence maps | 43 | 43 | **33** |
| Diagrams (valid) | 29 | 29 | **32** |
| Geographic qualifiers | 583 | 583 | **583** |
| Viewer repetition | ~8.74% | ~8.61% | **8.07%** |

Archival-image intents: **1,377** (beat churn removed; no explosion vs experiment).

## Representative (10 episodes)

All **10/10** content-approval eligible and editorially reviewable. **7** valid maps (5 sequence, 2 locator), **11** valid diagrams. No unexpected production blockers.

Notable rationales:
- **Black Death:** sequence maps + labour-policy diagrams from supported causal chains.
- **Bronze Age:** systems-collapse process diagram; blocked trade-network compile rejected.
- **Roman Empire:** causal diagrams from supported institutional cycles; locator maps only where broad geography is narrated.

## Validation

- `history-visual-modality-v35.unit.test.ts` — 8/8 pass
- `history-diagram-compile-v35.unit.test.ts` — 9/9 pass
- `history-entity-resolution-v35.unit.test.ts` — 55/55 pass
- `history-v35-corpus.acceptance.ts` — pass (30-episode corpus invariants + 40-episode regen)
- `@mediaforge/history` typecheck — pass

## Artifacts

- Approval pack: `artifacts/chatgpt-review/history-approval-packs-v3.5-episodes-01-40.zip`
- Pack SHA-256: `4e6f02f3559f5797254476cdee05e83866423219e71980cf6740b0c8dd45a3f1`
- Metrics script: `scripts/history-v35-modality-metrics.mjs`

## Files changed

- `packages/history/src/history-visual-opportunity-v35.ts`
- `packages/history/src/visual-planner-v35.ts`
- `packages/history/src/history-diagram-compile-v35.ts`
- `packages/history/src/history-visual-modality-v35.unit.test.ts`
- `scripts/history-v35-modality-metrics.mjs`

## Risks / follow-up

- Beat count is **below** baseline (~1,782 vs ~1,985) due to increased cluster merging; monitor editorial pacing.
- D-Day / Crusade / Armada still lack maps where narration lacks compile-ready multi-anchor evidence.
- Locator count (15) remains above semantic baseline (9); further tuning possible without quota hacks.
