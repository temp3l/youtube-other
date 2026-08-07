# Cursor Phase 01 — Franklin Golden Fixture

## Objective

Repair the source pipeline until the Franklin Expedition passes a real generated-artifact acceptance test.

Work only on Franklin.

Canonical episode:

```text
history-youtube-history-10-video-story-pack-05-franklin-expedition
```

Reference-only output:

```text
episodes/history-youtube-history-10-video-story-pack-05-franklin-expedition-v3.4/
```

Do not directly patch the reference output.

## Authority

Keep:

```text
sourceAuthorityMode: trusted-script
```

No historical research, web search, source retrieval, or evidence assessment.

A model may be used only for bounded no-web semantic proposals. Deterministic code must validate and compile final artifacts.

## Mandatory generated structures

### Map 1 — Outbound route

```text
Britain → Baffin Bay → broad Arctic/Northwest Passage search area
```

Requirements:

- maritime route;
- actor is the expedition or Erebus and Terror;
- May 1845 where narration supports it;
- no invented intermediate stops;
- no placeholder coordinates.

### Map 2 — Wintering and entrapment orientation

Use narration-supported places such as:

```text
Beechey Island
King William Island
relevant Arctic search/entrapment area
```

Broad orientation is acceptable. Speculative route precision is not.

### Map 3 — Abandonment march

Required semantics:

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

### Structured evidence graphic

At least one diagram or structured evidence graphic using narration-bound categories such as:

- Victory Point note;
- graves/remains;
- abandoned equipment;
- Inuit testimony;
- wreck discoveries.

Do not invent causal edges.

## Typed semantics

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

Qualifier behavior:

```text
May 1845 → temporal
June 11, 1847 → temporal
April 22, 1848 → temporal
105 survivors → count
129 officers and men → count
2014 → year
2016 → year
```

Day components must not also become counts.

## Pacing and ratio thresholds

```text
scenes: 45–75
visual updates: 70–95
average update interval: 6.5–9.5 seconds
opening updates in first 30 seconds: >= 4
16:9 coverage: 100%
9:16 coverage: 100%
```

All existing repetition thresholds must pass without being weakened.

## Generated-artifact acceptance test

Add a repository-consistent test that generates or inspects the real approval pack.

Preferred location:

```text
packages/history/test/acceptance/franklin-v34.acceptance.ts
```

It must fail unless:

```text
authority == trusted-script
research calls == 0
web search calls == 0
maps >= 4
diagrams/structured graphics >= 1
no placeholder coordinates
no stopword/pronoun map actors
no person used as map origin/destination
all map beats have complete map states
all diagram beats have complete diagram states
all timelines contain >= 2 related events
all factual ratio plans were evaluated
every beat has 16:9 and 9:16
quality thresholds pass
```

Do not hard-code passing generated JSON. Fixture-specific assertions may exist in tests, but implementation belongs in planners, compilers, validators, or typed registries.

## Required sequence

1. Add failing tests.
2. Implement minimal source changes.
3. Generate Franklin into a temporary output.
4. Run artifact acceptance.
5. Generate it again.
6. Prove deterministic output.
7. Produce the final Franklin ZIP.

## Completion evidence

Report:

- changed source files;
- tests added;
- exact commands and exit statuses;
- claims/entities/rejected entities;
- scenes/shots;
- maps/diagrams/timeline events;
- updates per minute;
- ratio coverage;
- gates;
- ZIP path and SHA-256;
- zero-research proof;
- determinism result.

Do not continue to Napoleon.
