# Cursor Phase 05 — Final Independent Audit

## Mode

Use Plan mode or a read-only Agent session.

Do not modify source code or generated artifacts.

## Inputs

Audit:

- four final approval packs;
- combined ZIP;
- portfolio acceptance report;
- publishing artifacts;
- source commit used to generate them.

## Integrity

Verify:

- all JSON parses;
- checksums;
- safe ZIP paths;
- nested ZIP equality;
- deterministic second generation;
- correct episode commands and IDs.

## Authority

Verify:

- `trusted-script`;
- no fake evidence or support;
- zero research/web calls;
- semantic model calls recorded only as non-research structuring.

## Required visual minimums

```text
Franklin: maps >= 4, diagrams/structured graphics >= 1
Napoleon: maps >= 3, diagrams >= 1
Fall of Rome: maps >= 2, diagrams >= 1
Black Death: maps >= 2, diagrams >= 2
Portfolio: maps >= 11, diagrams/structured graphics >= 5
```

## Semantic rejection rules

Reject maps with:

- stopword/pronoun actors;
- people used as places;
- dates/quantities used as places;
- placeholder coordinates;
- unsupported routes;
- contradictory route types.

Reject diagrams with:

- fragment nodes;
- meaningless generic edges;
- unsupported causal strengthening;
- missing narration bindings.

## Pacing

For each episode calculate:

- scenes;
- shots;
- updates/minute;
- average interval;
- opening updates in first 30 and 60 seconds;
- longest shot;
- long-beat multi-shot coverage;
- quality-threshold results.

## Ratio plans

Verify:

- every beat has 16:9 and 9:16;
- maps retain/remove labels and routes explicitly;
- diagrams retain/merge nodes and edges explicitly;
- timelines retain stable event IDs;
- collision and density analysis actually ran.

## Independent gate verdicts

Determine independently:

- structural;
- editorial;
- content;
- production;
- publishing.

Do not simply repeat exported states.

## Output

Create only:

```text
reports/history-v34-final-independent-audit.md
```

Include:

- blockers;
- factual/semantic issues;
- visual issues;
- publishing issues;
- concrete corrections;
- per-gate verdicts;
- episode scores;
- portfolio score.

Do not mark production or publishing final without measured audio, rendered media, final thumbnails, reviewed captions, and human upload review.
