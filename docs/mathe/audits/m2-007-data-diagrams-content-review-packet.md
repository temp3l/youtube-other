# M2-007 Data and Diagrams Review Packet

Status: **pending external review**. Exact target:
`class5-data-diagrams-standard.v1`. Tests do not imply approval. Source:
`de-gems-5-10-v1` / `1.0.0-draft.1`, `kmk-2022-math` normalized synthesis,
source review pending. Ordered content-set SHA-256:
`e64fb5edec1df210a7e2eb401b15533dee46053bd1530e028b3fb6221b899796`.

## `M5-DZ-001` — raw and tally lists

- Prerequisite proposal: root.
- Dataset `dataset-obst` (`e74bf42a9622e070a71274a7a88ddae79d0fd7f9fbf7b1d892d7cf5077c8cc68`):
  Apfel 4, Birne 3, Banane 5; total 12; unique maximum Banane.
- Dataset `dataset-schulweg` (`4c9b51308e1bd0dd106a247be0e39945cc58413e08eb45e4334be08f1e0fb4af`):
  Bus 6, Rad 4, Fuss 5; total 15; unique maximum Bus.
- Contract: raw values, ordered categories, exact totals, and tally groups are
  independently reconciled. The fifth stroke and every category cell have
  fact IDs and source lineage.
- Misconception: fifth stroke omitted or category dropped.
- Content SHA-256:
  `2ef42e53b67d18fe8d5d25abfdd1b3460bc5a3fa73f7ba3b3c9c1ea2bfbd2a84`.

## `M5-DZ-002` — diagrams

- Prerequisite proposal: `M5-DZ-001`.
- Dataset `dataset-farben` (`4cf819f31a576bd4e7780315a7e63a42605fd8a4cb27a6b39cc8c24915565b8d`):
  Rot 4, Blau 7, Gruen 5; column axis 0–8, tick 2; maximum Blau 7.
- Dataset `dataset-buecher` (`968b220a32a8baa060c1dd2aede5b96247cd0ae8eb8a48ea55119066c6ba038c`):
  A 3, B 6, C 9; bar axis 0–10, tick 2; maximum C 9.
- Contract: category order, axes, ticks, labels, bar heights, patterns, and
  visible values derive from the dataset. Every axis, label, and bar is
  fact-bound; color-independent cues are mandatory.
- Questions/solutions: identify the maximum and construct the exact chart.
- Misconception: width, gaps, or inconsistent scales treated as values.
- Content SHA-256:
  `5833c518e5c4e2c25c41cf51b52f71994bb862470d2de192aa2a4eaa99c1c4af`.

Approval must bind ordered IDs/hashes, datasets, release, reviewer, and evidence
hash. Any dataset, locale label, order, visual, renderer, or verifier change
requires a new decision. Probability is outside this target.
