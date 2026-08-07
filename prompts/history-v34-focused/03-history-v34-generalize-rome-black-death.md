# Goal 03 — Generalize to Fall of Rome and Black Death

## Preconditions

The generated-artifact acceptance tests for Franklin and Napoleon must pass.

Do not weaken either fixture’s requirements.

Reference-only directories:

```text
episodes/history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire-v3.4/
episodes/history-youtube-history-10-video-story-pack-04-black-death-v3.4/
```

Do not patch them directly.

## Fall of Rome mandatory outputs

### Maps

At least two:

1. Western/Eastern Empire orientation
2. Western fragmentation or changing control

Use only narration-supported states, regions, and movements.

### Diagram

At least one valid system diagram showing a narration-supported relationship such as:

```text
tax revenue
→ armies and administration
→ provincial control
→ continued revenue
```

and how breakdown intensified other pressures.

Do not produce a monocausal collapse model.

### Timeline

At least one meaningful multi-event chronology.

## Black Death mandatory outputs

### Maps

At least two:

1. Black Sea/Mediterranean spread orientation
2. wider affected-region or trade-network map

Use broad geography when precise routes are not supported.

### Diagrams

At least two:

1. transmission pathways;
2. social/economic consequences.

The transmission diagram must preserve uncertainty and distinguish pathways when narration does.

### Timeline

At least one meaningful multi-event chronology or progression.

## Episode thresholds

### Fall of Rome

```text
maps >= 2
diagrams >= 1
timeline events >= 4
scenes: 45–70
visual updates: 70–95
```

### Black Death

```text
maps >= 2
diagrams >= 2
timeline events >= 3
scenes: 40–65
visual updates: 65–90
```

For both:

```text
average update interval: 6.5–9.5 seconds
16:9 coverage: 100%
9:16 coverage: 100%
quality thresholds pass without weakening
```

## Required acceptance tests

Create repository-consistent generated-artifact tests:

```text
fall-of-rome-v34.acceptance.ts
black-death-v34.acceptance.ts
history-v34-portfolio.acceptance.ts
```

The portfolio test must fail unless:

```text
Franklin passes
Napoleon passes
Rome passes
Black Death passes
total maps >= 11
total diagrams/structured graphics >= 5
no mandatory visual silently downgraded
all factual visuals are narration-bound
all ratio analyses evaluated
trusted-script web/research calls == 0
```

## Regeneration

Do not regenerate all episodes until focused tests pass.

Then:

1. regenerate all four packs;
2. regenerate all four a second time;
3. verify deterministic equality;
4. produce:

```text
history-approval-packs-v3.4-final/
history-approval-packs-v3.4-final.zip
```

Include:
- four episode packs;
- comparison manifest;
- portfolio acceptance report;
- checksums;
- deterministic build report.

## Final report

Return a concise table:

- episode;
- scenes;
- shots;
- maps;
- diagrams;
- timeline events;
- updates/minute;
- 16:9/9:16 coverage;
- gate readiness;
- ZIP path and SHA-256.

Production may remain blocked for measured audio or final rendered media.

Do not add publishing metadata in this session.
