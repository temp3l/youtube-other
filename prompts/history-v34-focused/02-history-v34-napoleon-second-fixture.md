# Goal 02 — Napoleon Second Golden Fixture

## Preconditions

Run only after the Franklin generated-artifact acceptance test passes.

Preserve Franklin behavior. Do not weaken Franklin tests to make Napoleon pass.

Canonical episode ID:

```text
history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia
```

Reference-only directory:

```text
episodes/history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia-v3.4/
```

Do not patch it directly.

## Objective

Generalize the source implementation enough to generate a high-quality Napoleon pack with mandatory maps and a logistics diagram.

## Mandatory outputs

### Map 1 — Campaign orientation

Narration-bound orientation beginning with:

```text
Niemen River
Russian Empire
```

Use broad geography and no false precision.

### Map 2 — Advance toward Moscow

Represent only narration-supported major locations, such as:

```text
Niemen crossing
Smolensk
Borodino
Moscow
```

Do not add unstated battles or route points.

### Map 3 — Retreat from Moscow

Required semantics:

- actor: Grande Armée or Napoleon’s army;
- route type: overland;
- destination/route places must be canonical places;
- weather, hunger, disease, and attrition may appear only where narration supports them.

### Diagram 1 — Logistics and attrition

Answer:

```text
Why did the campaign destroy the Grande Armée?
```

Narration-bound factors may include:

- distance;
- supply-chain failure;
- fodder shortage;
- horse losses;
- disease;
- hunger;
- desertion;
- weather;
- retreat.

Do not accept fragment nodes such as `Exact` or meaningless edges such as:

```text
Exact → Grande Armée
```

## No-fallback rule

The three maps and one diagram are mandatory.

For these required outputs:

```text
archival-image fallback is prohibited
silent modality downgrade is prohibited
task completion is prohibited if generation fails
```

A failed required visual remains an explicit blocker.

## Acceptance thresholds

```text
maps >= 3
diagrams >= 1
scenes: 40–65
visual updates: 65–90
average update interval: 6.5–9.5 seconds
opening updates in first 30 seconds: >= 4
16:9 coverage: 100%
9:16 coverage: 100%
```

All existing repetition thresholds must pass without weakening them.

## Model boundary

A semantic model may propose:

- map intent;
- route actor;
- route endpoints;
- diagram nodes/edges;
- beat groupings.

It may not own:

- final coordinates;
- canonical place IDs;
- final graph validity;
- approval;
- authority mode.

Web search and research remain disabled.

## Required acceptance test

Create a repository-consistent generated-artifact test, preferably:

```text
packages/history/test/acceptance/napoleon-v34.acceptance.ts
```

It must fail unless:

```text
Franklin acceptance still passes
Napoleon authority == trusted-script
web/research calls == 0
map count >= 3
diagram count >= 1
required logistics concepts are represented
no placeholder coordinates
no invalid actor/origin/destination types
all map/diagram beats have complete states
all factual ratio plans were evaluated
quality thresholds pass
```

## Workflow

1. Add failing Napoleon tests.
2. Implement the smallest safe generalization.
3. Run Franklin regression tests.
4. Generate Napoleon only.
5. Run Napoleon artifact acceptance.
6. Regenerate Napoleon and prove determinism.
7. Produce one final Napoleon ZIP.

## Final report

Provide:
- changed source files;
- Franklin regression result;
- Napoleon counts and pacing;
- exact map purposes;
- exact diagram purpose;
- gate states;
- ZIP path and SHA-256;
- determinism result.

Do not regenerate Rome or Black Death in this session.
