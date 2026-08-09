# History V3.6 explanatory-relation IR

## Purpose

V3.5 combines entity/geography inference, geo facts, diagram concepts, context windows, scoring, and compilation. Local corrections can therefore change adjacent semantics. V3.6 separates those concerns: a validated relation is the semantic authority; future map and diagram compilers are deliberately simple consumers.

## Boundary

```text
canonical narration → claims → V3.6 atomic claim grounding
→ grounded relation evidence → ExplanatoryRelation → deterministic validation → future compilers
```

The V3.6 module has a proof-bearing shadow extractor, but no map/diagram compiler and no effect on V3.5 production plans. The future configuration seam is `HISTORY_RELATION_IR_VERSION=v35|v36-shadow|v36`; it is documented only, so the production default remains V3.5.

## Semantics and identity

The strict union distinguishes movement, spatial comparison, spatial area, causal, dependency, process, temporal sequence, policy response, and evidence set. Every participant is a typed reference. A relation is valid only when its episode-local support claims contain the exact grounded proposition. Claim classification alone is not evidence. Multi-token resolved proper names remain atomic.

`id` is a semantic relation ID, not an evidence ID. It is `relation-{kind}-{sha256-prefix}` over the episode, relation kind, and relation-specific canonical semantics only. Canonical entity IDs take precedence over labels. It excludes support claims, source spans, evidence-window IDs, timestamps, candidate IDs, render IDs, and random UUIDs.

The per-kind identity rules are deliberately not a generic participant serializer:

- Movement: `from`, ordered `via[]`, `to`.
- Spatial comparison: a canonical unordered set of distinct places.
- Spatial area: one place.
- Causal: ordered `cause -> effect`.
- Dependency: ordered `dependency -> dependent`; the dependent depends on the dependency.
- Process and temporal sequence: ordered `steps[]`.
- Policy response: ordered `condition -> response`.
- Evidence set: optional subject plus a canonical unordered set of evidence members. `evidence[]` is not a presentation order.

Invalid cardinality is rejected before a final semantic ID is computed. Direction and order are retained wherever they change meaning.

## Evidence provenance and merging

`supportClaimIds` is a canonical, sorted, deduplicated provenance set. Its separate `evidenceFingerprint` is `evidence-{sha256-prefix}` over that set. It never contributes to `id`.

Consequently, Lisbon → English Channel supported by `[C1]` and by `[C1, C2]` resolves to one semantic relation ID with different evidence fingerprints. A later candidate/extraction layer may merge valid support into the one canonical support set, but that merge must not change the semantic ID or relation participants.

## Phase 2 shadow candidate extraction

`extractShadowRelationCandidatesV36` is deliberately narrow. It projects only explicit `groundedPropositions` from episode-local `RelationSupportClaimV36` inputs, creates hardened relation records, merges identical semantic IDs by support provenance, and runs deterministic validation before returning candidates. The separate representative adapter may create those propositions only from persisted structured claims, resolved entity bindings, and a small enumerated vocabulary of exact proposition forms. It does not scan narration generally, call an LLM, or infer a substitute for missing participants.

Its result is marked `v36-shadow`, contains validated relations plus rejected/skipped candidate diagnostics, and has no production planner, configuration, map, or diagram consumer. It is a golden-corpus/proof-bound integration seam—not production extraction.

### Phase 2.2 bounded LLM proposer

The optional `bounded-llm-claim-projection` source is a shadow-only proposer behind the same unchanged deterministic validator. It is disabled unless `HISTORY_V36_LLM_SHADOW_PROPOSER=1`; its model is supplied by `HISTORY_V36_RELATION_PROPOSER_MODEL`. Calls are limited to two-claim semantic windows selected from rejected deterministic opportunities or named representative recall controls, with hard ceilings of 40 calls per run and 8 per episode.

Strict structured output may reference only participant and support IDs supplied in the packet. Unknown participants, out-of-window evidence, purpose-as-destination movement, schema failures, provider failures, and exhausted budgets fail open to deterministic-only shadow output. Successful responses use a timestamp-free SHA-256 cache identity over the episode, ordered claim IDs, normalized claim content, participant bindings, relation schema, prompt version, model, and provider.

### Phase 2.3 atomic claim grounding

`groundAtomicClaimsV36` adds a claim-local, V3.6-only evidence layer before relation extraction. Its bounded predicate and assertion-status vocabularies distinguish asserted facts from intended, attempted, uncertain, counterfactual, and reported propositions. Every atom retains its episode and claim IDs, exact UTF-16 source span and text hash, resolved participant IDs, stable grounding rule, and grounding schema version.

Grounding IDs are deterministic hashes of canonical proposition semantics plus exact source provenance. Proper names remain atomic, grouped concepts stay grouped, nested evidence entities remain qualifiers, and unresolved place participants fail closed. Franklin grounds Britain as movement origin and Northwest Passage as a search object—not a destination—and Spanish Armada mission language remains intended rather than completed movement.

The lowering adapter maps only exact asserted, claim-local atoms that mechanically match the existing evidence union. It neither composes claims nor approves relations. The deterministic proposer and `ExplanatoryRelation` validator remain unchanged semantic authorities; the bounded LLM path remains opt-in and live calls are outside Phase 2.3.

## Contract and provenance versioning

The hardened persisted relation contract is `history-explanatory-relations.v2`. V1 review artifacts must not be treated as V2 records because V1 overloaded semantic identity with evidence provenance. `explanatoryRelationSchemaV36` is the authoritative Zod runtime validator; `relation-schema.json` is machine-enforcing Draft 2020-12 JSON Schema generated directly from it with Zod's native JSON-Schema exporter. `relation-contract-document.json` is supplemental field-level review documentation generated alongside it.

The atomic grounding contract is independently versioned as `history-atomic-claim-grounding.v2`. `atomicGroundingArtifactSchemaV36` is authoritative; `atomic-grounding-schema.json` and `atomic-grounding-contract-document.json` are generated mechanically from the same module. V2 adds direct `process-sequence` and `precedes` projection plus native structured-proposition lineage; it does not add relation inference.

Review artifact provenance is independently versioned as `history-v3.6-relation-ir-review-provenance.v3`. V3 separates the dedicated `history-v3.6-shadow-relations-review` artifact kind from the earlier relation-IR contract review kind. `reviewArtifactProvenanceSchemaV36` remains the authoritative strict Zod runtime validator and generates `provenance-schema.json`.

## Fail closed

Insufficient deterministic evidence yields an invalid relation and typed diagnostics. No explanatory map or diagram may follow from it. A future pipeline may choose archival or reconstruction imagery instead; it may not invent a relation.

## Migration

1. Contracts and golden fixtures — complete here.
2. Deterministic extraction plus bounded LLM candidate experiment — complete in representative shadow mode; no production integration.
3. Validators plus representative shadow corpus.
4. V3.6 map/diagram consumers.
5. Forty-episode shadow differential.
6. Feature-flagged production cutover.
