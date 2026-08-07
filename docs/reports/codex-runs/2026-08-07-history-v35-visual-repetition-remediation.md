# History V3.5 visual repetition remediation

## Summary

Implemented semantic editorial shot planning to eliminate slideshow-style repetition and long-static runtime without touching frozen map compiler code. All four v3.5 corpus episodes now pass `qualityMetrics.passes`; `EDITORIAL_REPETITION_THRESHOLD` is cleared.

## Root cause

Measured failures came from `buildShotsForBeat` mechanically splitting beats into `stage 1/2` shots sharing the same asset, claim, and modality; every beat defaulting to `establish` + `Evidentiary hold on …` compositions; camera motion falsely resetting the visual clock; and repetition metrics that ignored progression role, claim anchors, and template families.

Corpus before: ~52.1% long-static runtime, ~16.9% template duplication (all episodes blocked).

## Changed files

- `packages/history/src/history-visual-repetition-v35.ts` — semantic signatures, template families, novelty scoring, editorial shot builder, refinement pass, varied concepts
- `packages/history/src/history-visual-repetition-v35.unit.test.ts` — tests A–G + sequence builder
- `packages/history/src/history-visual-semantics-v35.ts` — meaningful motion/static measurement; concept builder delegation
- `packages/history/src/visual-planner-v35.ts` — editorial shot integration, semantic repetition metrics, Black Death modality hints

## Algorithm

Shots are built via `buildEditorialShotSequenceV35` with progression roles (`establish→develop→explain→contrast→resolve`) rotated by beat index and claim hash. `resolveProgressionRoleForShot` enforces cross-shot novelty. `refineShotPlanForRepetitionV35` merges mechanical stage splits and replans low-novelty pairs. Repetition scoring uses structured `VisualSemanticSignature` (medium, subject, claims, template family, information layer) — not camera strings.

## Before / after metrics

| Episode     | Static before | Static after | Duplication before | Duplication after |
| ----------- | ------------: | -----------: | -----------------: | ----------------: |
| Napoleon    |          48.1% |         3.9% |               20.0% |              7.7% |
| Rome        |          56.0% |         8.4% |               14.5% |              5.4% |
| Black Death |          55.6% |         4.5% |               22.6% |             13.2% |
| Franklin    |          48.5% |         7.6% |               10.4% |              3.0% |

Corpus averages: long-static 6.1%, template duplication 7.3%.

## Editorial blockers

| Episode     | EDITORIAL_REPETITION_THRESHOLD |
| ----------- | ------------------------------ |
| Napoleon    | PASS                           |
| Rome        | PASS                           |
| Black Death | PASS                           |
| Franklin    | PASS                           |

## Map freeze regressions

| Check                         | Result |
| ----------------------------- | ------ |
| Napoleon Niemen actor         | PASS   |
| Napoleon Berezina isolation   | PASS   |
| Franklin actor provenance     | PASS   |
| Black Death downgrade         | PASS   |
| MAP_* blockers                | 0      |

## Tests

- `pnpm test:focused -- packages/history/src/history-visual-repetition-v35.unit.test.ts` — pass (8)
- `pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts` — pass
- `pnpm test:focused -- packages/history/src/history-map-actor-v35.unit.test.ts` — pass (6)
- `pnpm exec tsx scripts/history-v35-regenerate-combined.mjs` — pass, deterministic

## Corpus regeneration

| Episode     | Shots | Plan hash (prefix) | passes |
| ----------- | ----: | ------------------ | ------ |
| Napoleon    |   101 | `0c7661a5`         | true   |
| Rome        |   101 | `b3a35d59`         | true   |
| Black Death |   100 | `d665ffab`         | true   |
| Franklin    |   110 | `de7abc3e`         | true   |

## Remaining unrelated blockers

- `TIMING_MEASUREMENT_REQUIRED` (all four episodes)
- Historical attestation / production approval warnings unchanged

## Commit

`70bab8171bbb397ccb5e571f378fca77f84d4f98` (pre-commit; new files untracked)
