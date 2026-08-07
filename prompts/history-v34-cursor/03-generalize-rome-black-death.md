# Cursor Phase 03 — Generalize to Rome and Black Death

## Preconditions

Franklin and Napoleon artifact acceptance tests pass.

Do not weaken either fixture.

Reference-only outputs:

```text
episodes/history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire-v3.4/
episodes/history-youtube-history-10-video-story-pack-04-black-death-v3.4/
```

Do not patch them directly.

## Fall of Rome requirements

### Maps

At least two:

1. Western/Eastern Empire orientation
2. Western fragmentation or changing control

### Diagram

At least one narration-bound systems diagram, for example:

```text
tax revenue
→ armies and administration
→ provincial control
→ continued revenue
```

Represent breakdown without creating a monocausal explanation.

### Timeline

At least four related timeline events.

### Thresholds

```text
maps >= 2
diagrams >= 1
timeline events >= 4
scenes: 45–70
visual updates: 70–95
```

## Black Death requirements

### Maps

At least two:

1. Black Sea/Mediterranean spread orientation
2. wider affected-region or trade-network map

### Diagrams

At least two:

1. transmission pathways;
2. social/economic consequences.

Preserve uncertainty and alternative pathways.

### Timeline

At least three related timeline events.

### Thresholds

```text
maps >= 2
diagrams >= 2
timeline events >= 3
scenes: 40–65
visual updates: 65–90
```

## Shared thresholds

```text
average update interval: 6.5–9.5 seconds
16:9 coverage: 100%
9:16 coverage: 100%
quality thresholds pass without weakening
```

## Required tests

Add:

```text
fall-of-rome-v34.acceptance.ts
black-death-v34.acceptance.ts
history-v34-portfolio.acceptance.ts
```

The portfolio test must fail unless:

```text
all four episode acceptance tests pass
total maps >= 11
total diagrams/structured graphics >= 5
no mandatory visual silently downgraded
all factual visuals are narration-bound
all factual ratio analyses evaluated
trusted-script research/web calls == 0
```

## Regeneration

Do not regenerate the full portfolio until all focused tests pass.

Then:

1. regenerate all four final packs;
2. regenerate them a second time;
3. verify deterministic equality;
4. produce:

```text
history-approval-packs-v3.4-final/
history-approval-packs-v3.4-final.zip
```

Include comparison manifest, portfolio acceptance report, checksums, and deterministic build evidence.

## Completion evidence

Return a concise table:

- episode;
- scenes;
- shots;
- maps;
- diagrams;
- timeline events;
- updates/minute;
- ratio coverage;
- gate readiness;
- ZIP path and SHA-256.

Do not add publishing metadata in this phase.
