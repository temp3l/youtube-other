# Goal 05 — Final Independent History V3.4 Audit

## Role

Act as an independent release auditor.

Do not repair source code or generated artifacts during this goal.

Audit:
- four final regenerated approval packs;
- portfolio acceptance report;
- publishing artifacts;
- source commit used to generate them.

## Integrity checks

Verify:
- all JSON parses;
- checksums pass;
- ZIP paths are safe;
- nested ZIPs match expanded directories;
- deterministic second generation matches;
- commands use correct episode IDs.

## Authority checks

Verify:
- all episodes use `trusted-script`;
- no fake evidence or support status;
- web/research calls are zero;
- optional semantic calls are recorded as non-research structuring.

## Required visual minimums

```text
Franklin: maps >= 4, diagrams/structured graphics >= 1
Napoleon: maps >= 3, diagrams >= 1
Fall of Rome: maps >= 2, diagrams >= 1
Black Death: maps >= 2, diagrams >= 2
Portfolio: maps >= 11, diagrams/structured graphics >= 5
```

## Semantic rejection rules

Reject any map containing:
- stopword or pronoun actor;
- person used as place;
- date/quantity used as place;
- placeholder coordinates;
- unsupported route;
- route type contradicting narration.

Reject any diagram containing:
- sentence fragments as nodes;
- meaningless generic edges;
- unsupported causal strengthening;
- missing narration bindings.

## Beats and pacing

For each episode report:
- scenes;
- shots;
- updates/minute;
- average update interval;
- opening updates in first 30 and 60 seconds;
- longest shot;
- long-beat multi-shot coverage;
- quality thresholds.

## Ratio checks

Verify:
- every beat has 16:9 and 9:16;
- maps explicitly retain/remove labels/routes;
- diagrams explicitly retain/merge nodes/edges;
- timelines retain stable event IDs;
- collision and density analysis executed.

## Independent gates

Determine independently:
- structural ready for human approval;
- editorial ready for human approval;
- content ready for human approval;
- production ready;
- publishing ready.

Do not simply repeat exported states.

## Output

Write:

```text
reports/history-v34-final-independent-audit.md
```

Return:
- blockers;
- factual/semantic issues;
- visual issues;
- publishing issues;
- concrete corrections;
- per-gate verdict;
- per-episode score;
- portfolio score.

Do not mark production or publishing final if measured audio, rendered media, thumbnail images, or human upload review are missing.
