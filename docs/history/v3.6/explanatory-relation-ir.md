# History V3.6 explanatory-relation IR

## Purpose

V3.5 combines entity/geography inference, geo facts, diagram concepts, context windows, scoring, and compilation. Local corrections can therefore change adjacent semantics. V3.6 separates those concerns: a validated relation is the semantic authority; future map and diagram compilers are deliberately simple consumers.

## Boundary

```text
canonical narration → claims → resolved entities/places
→ ExplanatoryRelation → deterministic validation → future compilers
```

The V3.6 module does not extract relations, compile maps/diagrams, or affect V3.5 production plans. The future configuration seam is `HISTORY_RELATION_IR_VERSION=v35|v36-shadow|v36`; it is documented only, so the production default remains V3.5.

## Semantics

The strict union distinguishes movement, spatial comparison, spatial area, causal, dependency, process, temporal sequence, policy response, and evidence set. Every participant is a typed reference. A relation is valid only when its episode-local support claims contain the exact grounded proposition. Claim classification alone is not evidence. Multi-token resolved proper names remain atomic.

IDs are `relation-{kind}-{sha256-prefix}` over episode, kind, ordered canonical participants, and sorted support claims. They exclude render IDs, timestamps, candidate IDs, and context-window IDs.

## Fail closed

Insufficient deterministic evidence yields an invalid relation and typed diagnostics. No explanatory map or diagram may follow from it. A future pipeline may choose archival or reconstruction imagery instead; it may not invent a relation.

## Migration

1. Contracts and golden fixtures — complete here.
2. Deterministic/LLM candidate extraction — future, shadow-only.
3. Validators plus representative shadow corpus.
4. V3.6 map/diagram consumers.
5. Forty-episode shadow differential.
6. Feature-flagged production cutover.
