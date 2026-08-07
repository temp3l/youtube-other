# Cursor Phase 02 — Napoleon Second Fixture

## Preconditions

Franklin acceptance passes and remains protected.

Canonical episode:

```text
history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia
```

Reference-only output:

```text
episodes/history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia-v3.4/
```

Do not patch it directly.

## Objective

Generalize the proven source implementation enough to produce the mandatory Napoleon campaign visuals.

## Mandatory visuals

### Map 1 — Campaign orientation

Use narration-supported geography beginning with:

```text
Niemen River
Russian Empire
```

### Map 2 — Advance toward Moscow

Use only narration-supported major locations, potentially including:

```text
Niemen
Smolensk
Borodino
Moscow
```

### Map 3 — Retreat from Moscow

Requirements:

- actor is Grande Armée or Napoleon’s army;
- route type is overland;
- canonical place endpoints;
- no unsupported route precision.

### Diagram 1 — Logistics and attrition

Answer:

```text
Why did the campaign destroy the Grande Armée?
```

Narration-bound concepts may include:

- distance;
- supply-chain failure;
- fodder shortage;
- horse losses;
- disease;
- hunger;
- desertion;
- weather;
- retreat.

Reject fragment nodes and meaningless generic edges.

## Hard no-fallback rule

The three maps and one diagram are mandatory.

They may not silently become archival-image beats.

A failed mandatory visual remains a blocker and prevents completion.

## Acceptance

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

All existing quality thresholds must pass without weakening.

## Generated-artifact test

Add:

```text
packages/history/test/acceptance/napoleon-v34.acceptance.ts
```

or the repository-consistent equivalent.

It must fail unless:

```text
Franklin acceptance still passes
authority == trusted-script
research/web calls == 0
maps >= 3
diagrams >= 1
required logistics concepts are represented
no placeholder coordinates
no invalid actor/origin/destination types
all map/diagram beats have complete states
all factual ratio analyses were evaluated
quality thresholds pass
```

## Required sequence

1. Add failing Napoleon tests.
2. Implement the smallest generalization.
3. Run Franklin tests.
4. Generate Napoleon only.
5. Run Napoleon acceptance.
6. Generate Napoleon a second time.
7. Prove determinism.
8. Produce the final Napoleon ZIP.

## Completion evidence

Report:

- changed files;
- Franklin regression result;
- Napoleon metrics;
- exact map purposes;
- exact diagram purpose;
- exact commands and exit statuses;
- gate states;
- ZIP path and SHA-256;
- determinism result.

Do not regenerate Rome or Black Death.
