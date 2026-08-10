# Diagram entailment calibration + map semantic dedup

## Checkpoints

| Role | Tag/SHA |
|------|---------|
| Pre-calibration | `history-v3.5-pre-calibration-dedup` → `e044497` |
| Semantic baseline | `aae72a565c4cf00e9b61576fc04f06e1a9a0fe73` |
| **Remediation** | `history-v3.5-grounded-modality-baseline-v3` → `62c46f4` |

## Root causes

1. **Bronze Age false negative:** `compileBronzeSystemsCollapseDiagramV35` used labels (`trade network disruption`, `military fragmentation`) not entailed by collapse narration; valid diagrams blocked at finalize.
2. **Tutankhamun false positive:** `leads-to` edges accepted on entity co-occurrence without causal/locative mismatch rejection.
3. **Map fan-out:** `scopedMapCacheKey` keyed on `scopeClaimIds`, so identical semantic maps materialized once per overlapping context window (~52 duplicates / ~20 episodes).
4. **Geo-fact fan-out:** `extractGeoFactsV35` deduped by volatile fact id only; overlapping windows re-emitted equivalent relations.
5. **Franklin movement regression:** `inferRequestedSemanticType` preferred `sequence` for area intents with endpoints even when moving actors were present.

## Fixes

- **Entailment:** mechanism edge support (`labour scarcity → wage pressure`), co-occurrence/`leads-to` rejection (`DIAGRAM_RELATIONSHIP_TYPE_MISMATCH`), normalized compound stems (`trade network disruption`, `political instability`).
- **Bronze compile:** collapse labels aligned to claim wording (`trade disruption`, `migration pressure`, etc.).
- **Map dedup:** new `history-map-semantic-dedup-v35.ts`; planner reuses map states by semantic identity, merges scope provenance.
- **Geo dedup:** semantic identity collapse in `extractGeoFactsV35`.
- **Movement:** route-like intents with moving actors request `movement`; fallback preserves movement when movement facts exist.

## Corpus metrics (40 episodes, post-`62c46f4`)

| Metric | Pre (`e044497`) | Post (`62c46f4`) |
|--------|----------------:|-----------------:|
| Visual beats | 1985 | **1985** |
| Geographic qualifiers | 583 | **583** |
| Geo facts (exported) | 204 | **201** |
| Unique map states (beat-linked) | 163 | **111** |
| Map beats | 163 | 163 |
| Semantic duplicate map states | ~52 | **0** |
| Movement / sequence / locator | 0 / 116 / 47 | **2 / 69 / 40** |
| Valid diagrams | 4 | **5** |

## Tests

- `history-v35.unit.test.ts` — 16/16 pass (Bronze Age diagram selection restored)
- `history-diagram-entailment-v35.unit.test.ts` — 10/10 pass
- `history-map-semantic-dedup-v35.unit.test.ts` — 2/2 pass
- `history-map-compiler-v35.unit.test.ts` — Franklin movement pass
- `@mediaforge/history` typecheck — pass

## Files changed

- `history-diagram-entailment-v35.ts`, `history-diagram-compile-v35.ts`
- `history-map-semantic-dedup-v35.ts` (new), `history-map-semantic-dedup-v35.unit.test.ts` (new)
- `history-geo-facts-v35.ts`, `history-map-compiler-v35.ts`, `visual-planner-v35.ts`
- `history-diagram-entailment-v35.unit.test.ts`

## Risks

- Unique map states (111) remain above semantic baseline (~54); beats still share states but map-beat count is high. Further beat-level map gating may be needed separately.
- Corpus acceptance not re-run this session (hook budget); recommend `pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts`.

## Approval pack

- Path: `artifacts/chatgpt-review/history-approval-packs-v3.5-episodes-01-40-20260808T155805Z.zip`
- SHA-256: `8c67634b7f1e47a523f92debcba2dcb07043652b7ecab78aca008a3d611f9278`
- Provenance `gitCommitSha`: `62c46f4914f60028388d675f3bf053e8ca37929d`
