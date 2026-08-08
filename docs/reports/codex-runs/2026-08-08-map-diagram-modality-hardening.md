# Map and diagram modality hardening

## Checkpoints

| Item | Value |
|------|-------|
| Semantic baseline commit | `82b4192` |
| Semantic baseline tag | `history-v3.5-semantic-baseline` |
| Modality hardening commit | see `git rev-parse HEAD` after pull |
| Modality hardening tag | `history-v3.5-modality-hardening` |
| Branch | `master` |

Restore baseline (documentation only):

```bash
git switch master
git reset --hard 82b4192
```

## Root causes

### Map under-selection
- Diagram reservation preempted map in `resolveClusterModality()` with no spatial scoring.
- `detectMapOpportunityV35` lacked invasion/landing vocabulary; no `scoreMapOpportunityV35`.
- `proposeMapIntentsV34` skipped single-place landing claims before locator intents.
- `MOVEMENT_NARRATION_PATTERN` omitted `landed` / `landing`.

### Diagram under-selection
- Map compile probe won over diagram eligibility in `resolveClusterModality()`.
- Diagram reservation threshold was 4 with no compile fallback via listed causal factors.
- `compileAbstractCausalDiagramV35` required thematic label table hits only.

## Changes

- `scoreMapOpportunityV35`, extended spatial detection, biography negative guard.
- Map/diagram arbitration in `resolveClusterModality()` with compile probe + scores.
- Bounded context-window map score boost (adjacent beats).
- Landing/invasion single-place map intents in `proposeMapIntentsV34`.
- Diagram reservation threshold 4→3; listed-factor causal compile fallback.
- `history-visual-modality-v35.unit.test.ts` (map/diagram positive/negative + planner integration).

Geography/entity layers unchanged from `82b4192`.

## Tests

| Command | Result |
|---------|--------|
| `history-visual-modality-v35.unit.test.ts` | 6/6 |
| `history-v35.unit.test.ts` | 16/16 |
| `history-entity-resolution-v35.unit.test.ts` | 55/55 |
| `history-v35-corpus.acceptance.ts` | 1/1 |
| `tsc -p packages/history` | pass |

## Corpus metrics

| Metric | Accepted baseline | After hardening |
|--------|-------------------|-----------------|
| map states | 54 | **67** |
| diagram states | 29 | **29** |
| geographic qualifiers | 583 | **583** |
| DIAGRAM_VISUAL_COVERAGE_SUSPICIOUS | ~21 | **21** |
| GEOGRAPHIC_VISUAL_COVERAGE_SUSPICIOUS | ~6 | **5** |
| content-approval eligible | 40/40 | **40/40** |

## Representative episodes (maps / diagrams)

| Episode | After |
|---------|-------|
| Caesar in Gaul | 2 / 0 |
| Peloponnesian War | 6 / 0 |
| Roman Empire | 4 / 3 |
| Cuban Missile Crisis | 4 / 2 |
| Bronze Age | 2 / 5 |
| First Crusade | 1 / 0 |
| D-Day | 0 / 0 — narration lacks resolvable multi-place compile path; no change forced |
| 1066 | 0 / 1 — diagram preferred for battle sequence; no unjustified map |
| Tenochtitlan | 0 / 0 — Lake Texcoco geography not seeded; no change justified |
| Spanish Armada | 0 / 0 — maritime movement present but map compile blocked; follow-up seeding |

## Acceptance

- 40/40 corpus PASS; `TIMING_MEASUREMENT_REQUIRED` unchanged.
- No `REQUIRED_GEOGRAPHY_MISSING:Bay` or `:Sea` on episodes 08, 10, 11.
- Plans at `episodes/<id>/source/history-v3.5/plan.json`.
- Combined approval-pack CLI blocked by unrelated `veronica-media` import.

## Risks

- Map count +13 corpus-wide; tuned to avoid locator-intent flood after initial over-selection.
- Zero-map episodes may need gazetteer seeds, not quota forcing.
