# Goal 01 — Franklin Expedition Golden Fixture

## Objective

Repair the History pipeline in source code until the Franklin Expedition passes a generated-artifact acceptance test.

Do not generalize to the other episodes yet.

Canonical episode ID:

```text
history-youtube-history-10-video-story-pack-05-franklin-expedition
```

Reference-only directory:

```text
episodes/history-youtube-history-10-video-story-pack-05-franklin-expedition-v3.4/
```

Do not edit that directory as the implementation.

## Authority

Keep:

```text
sourceAuthorityMode: trusted-script
```

No historical research, web search, source retrieval, or evidence assessment.

An OpenAI model may be used only for bounded semantic proposals when the repository already supports a no-web semantic mode. Application code owns final IDs, typed fields, places, coordinates, graphs, timing, and gates.

## Mandatory generated visual structures

### Map 1 — Outbound route

Narration-bound movement:

```text
Britain → Baffin Bay → broad Arctic/Northwest Passage search area
```

- actor: Franklin expedition or Erebus and Terror;
- route type: maritime;
- departure period: May 1845 where narration supports it;
- no invented intermediate stops;
- no placeholder coordinates.

### Map 2 — Wintering and entrapment orientation

Orient the viewer with narration-supported places such as:

```text
Beechey Island
King William Island
relevant Arctic search/entrapment area
```

A broad orientation map is acceptable. Speculative route precision is not.

### Map 3 — Abandonment march

Required exact semantics:

```text
actor: surviving expedition members
origin: King William Island
destination: Back River
leaders: Francis Crozier and James Fitzjames
route type: overland
period: April 1848
```

### Map 4 — Wreck discoveries

Show narration-supported discovery locations and years:

```text
HMS Erebus — 2014
HMS Terror — 2016
```

Use broad precision if the narration is broad.

### Structured evidence graphic

At least one diagram or structured evidence graphic covering narration-bound evidence categories, for example:

- Victory Point note;
- graves/remains;
- abandoned equipment;
- Inuit testimony;
- wreck discoveries.

Do not invent causal links.

## Required entity types

At minimum:

```text
Royal Navy → organization
Sir John Franklin → person
Francis Crozier → person
James Fitzjames → person
HMS Erebus → ship
HMS Terror → ship
Britain → state/place
Baffin Bay → water-body
Beechey Island → island/place
King William Island → island/place
Back River → river/place
Northwest Passage → region/conceptual route
```

## Required qualifier behavior

```text
May 1845 → temporal
June 11, 1847 → temporal
April 22, 1848 → temporal
105 survivors → count
129 officers and men → count
2014 → year
2016 → year
```

`11` and `22` must not also become counts.

## Beat and pacing acceptance

```text
scenes: 45–75
visual updates: 70–95
average update interval: 6.5–9.5 seconds
opening updates in first 30 seconds: >= 4
16:9 coverage: 100%
9:16 coverage: 100%
```

Long/dense beats must receive multiple shots where appropriate. Existing quality thresholds must pass without weakening them.

## Required artifact acceptance test

Create a repository-consistent generated-artifact test, preferably:

```text
packages/history/test/acceptance/franklin-v34.acceptance.ts
```

It must generate or inspect the real approval pack and fail unless:

```text
authority == trusted-script
web search calls == 0
research calls == 0
map count >= 4
diagram/structured-graphic count >= 1
no placeholder coordinates
no pronoun or stopword map actors
no person used as map origin/destination
all map beats have complete map states
all diagram beats have complete diagram states
all timelines contain >= 2 related events
all factual visuals have evaluated ratio plans
all beats have 16:9 and 9:16
quality thresholds pass
production is blocked only by legitimate production prerequisites
```

Do not satisfy the test by hard-coding generated JSON. Fixture-specific expected semantics may exist in the test, but general behavior must live in planners, compilers, validators, or typed registries.

## Execution

1. Add failing tests.
2. Implement minimal source changes.
3. Generate Franklin into a temporary directory.
4. Run artifact acceptance.
5. Generate it a second time.
6. Verify deterministic output.
7. Produce one final Franklin V3.4 ZIP.

## Final report

Return only:
- changed source files;
- tests added;
- exact commands;
- counts for claims, entities, rejected entities, scenes, shots, maps, diagrams, and timeline events;
- updates/minute;
- ratio coverage;
- gate states;
- final ZIP path and SHA-256;
- zero-research proof;
- determinism result.

Do not continue to Napoleon.
