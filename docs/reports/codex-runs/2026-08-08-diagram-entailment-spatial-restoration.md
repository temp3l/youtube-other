# Diagram entailment + spatial baseline restoration

## Deliverables

| # | Item | Value |
|---|------|-------|
| 1 | Pre-remediation checkpoint | tag `history-v3.5-pre-entailment-remediation` → `c24dac97` |
| 2 | Diagram entailment root cause | Provenance checked episode-local claim IDs only; `isClaimGroundedDiagramLabelV35` allowed 50% token overlap; entity labels used as nodes without atomic span checks |
| 3 | Proper-name fragmentation root cause | Diagram compile used tokenized entity labels directly; multi-token spans not preserved at node construction |
| 4 | Geo-fact loss root cause | `buildReviewableGeoFactsV35` exports only geo facts referenced by map states; `resolveClusterModality` gated maps on explanatory tier only; map compile used beat `claimIds` while probe used wider context |
| 5 | Locator-vs-sequence root cause | `selectMapIntentForBeatV34` preferred locator when movement language absent despite sequence geo facts in scope |
| 6 | Files changed | See commit `e044497` (10 files) |
| 7 | Tests added/updated | `history-diagram-entailment-v35.unit.test.ts`, `history-napoleon-entailment.unit.test.ts`, `history-visual-modality-v35.unit.test.ts`, `history-v35-corpus.acceptance.ts`, `history-diagram-compile-v35.unit.test.ts` |
| 8 | Representative results | See table below |
| 9 | Restored geo-fact identities | Tutankhamun valley/tomb relations; French Revolution Britain–Austria–France; Cuban Crisis US–USSR–Cuba–Europe–Berlin sequence; Greenland Viking route relations; Black Death spread sequence participants |
| 10 | Invalid diagrams removed/blocked | 22 formerly-valid diagrams blocked (26→4 valid); includes Hiroshima `military fragmentation`, Caesar/Pompey abstractions, Pearl Harbor entity-fragment chains, unsupported cross-node edges |
| 11–15 | Entailment proofs | Corpus `assessDiagramProvenanceForPlanV35`: ungrounded valid nodes/edges/questions = 0; proper-name fragmentation = 0; cross-episode = 0 |
| 16 | Canonical beats | **1985** (unchanged) |
| 17 | Geographic qualifiers | **583** |
| 18 | Geo/map distribution | geo facts **204**; beat-linked maps **163** (locator **47**, sequence **116**, movement **0**); valid diagrams **4**, blocked **11** |
| 19 | Corpus acceptance | **PASS** (30-episode acceptance suite; 40-episode pack all content-eligible) |
| 20 | Commit SHA | `e044497d3f09f6361ce38fc55dd0e4ec0daa4aea` |
| 21 | Tag | `history-v3.5-grounded-modality-baseline-v2` |
| 22 | Approval pack | `artifacts/chatgpt-review/history-approval-packs-v3.5-episodes-01-40-20260808T145017Z.zip` |
| 23 | Provenance manifest | `generatedAt` 2026-08-08T14:52:18Z; `gitCommitSha` e044497; `semanticBaselineCommitSha` aae72a56; `plannerVersion` history-visual-planner.v3.5.0 |
| 24 | Report path | this file |

## Git checkpoints

| Role | Tag/SHA |
|------|---------|
| Semantic baseline | `aae72a565c4cf00e9b61576fc04f06e1a9a0fe73` |
| Pre-entailment | `history-v3.5-pre-entailment-remediation` → `c24dac97` |
| **Remediation** | `history-v3.5-grounded-modality-baseline-v2` → `e044497` |

## Corpus comparison (40 episodes)

| Metric | Semantic baseline (~) | Pre (`c24`, 140840Z pack) | Remediated (`e044`, 145017Z pack) |
|--------|----------------------:|--------------------------:|----------------------------------:|
| Visual beats | 1985 | 1985 | **1985** |
| Geographic qualifiers | 583 | 583 | **583** |
| Geo facts (exported) | ~155 | 142 | **204** |
| Beat-linked maps | ~54 | 56 | **163** |
| Sequence maps | ~44 | 38 | **116** |
| Locator maps | ~9 | 17 | **47** |
| Movement maps | ~1 | 1 | **0** |
| Valid diagrams | ~29 | 26 | **4** |
| Archival beats | — | 1572 | 1489 |
| Viewer-concept repetition | — | 8.7% | **8.3%** |

Pack SHA-256: `537679a663df41c4222420cf07bb91dfe3246caabac66e9888f198e3c558ddc5`

## Representative episode deltas (geo facts / map beats)

| Ep | Topic | Pre | Remediated |
|----|-------|----:|-----------:|
| 05 | Black Death | 13 / 8 | **20 / 15** |
| 08 | Cuban Missile Crisis | 4 / 2 | **13 / 11** |
| 11 | Pompeii | 3 / 1 | **3 / 2** |
| 18 | Peloponnesian War | 13 / 5 | **13 / 9** |
| 26 | Greenland Vikings | 9 / 3 | **12 / 11** |
| 29 | Tutankhamun | 0 / 0 | **3 / 3** |
| 37 | French Revolution | 0 / 0 | **5 / 3** |
| 33 | Pearl Harbor | 8 / 2 | **14 / 7** |
| 34 | Hiroshima | 6 / 2 | **6 / 6** (unsupported diagram blocked) |
| 14 | Caesar vs Pompey | 3 / 1 | **3 / 2** (unsupported diagram blocked) |

## Tests run

- `history-diagram-entailment-v35.unit.test.ts` — 8/8 pass
- `history-diagram-compile-v35.unit.test.ts` — 9/9 pass (Mongol `combining` convergence fix)
- `history-v35-corpus.acceptance.ts` — pass
- `@mediaforge/history` typecheck — pass

## Risks / follow-up

- Map beat count (**163**) exceeds semantic baseline (~54) and pre-remediation (56); relation-geo-fact map path may be over-selecting. Geo facts restored but locator share rose (47 vs baseline ~9). Tune `relationGeoFactSelected` gate if editorial review flags map churn.
- Valid diagram count dropped sharply (26→4); expected trade-off for entailment correctness.
- Movement map count is 0 (was 1 pre); verify if intentional.
