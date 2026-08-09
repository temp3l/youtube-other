# V3.6 structured claim boundary

Repository evidence places canonical claim creation in `structureTrustedScriptClaimsV34`. It emits one deterministic `HistoryClaimV34` per canonical narration unit, assigns claim kind during normalization, binds entity mentions and geographic roles, and persists exact narration spans. V3.5 workflow state serializes that contract as `structured-claims.json`; V3.5 planning and plan hashes consume its existing fields.

Phase 2.5 therefore leaves `HistoryClaimV34` and V3.5 serialization unchanged. A separate `StructuredClaimEnvelopeV36` sits adjacent to the canonical boundary. The native path accepts typed propositions produced with a future V3.6 canonical claim. The historical path wraps only the frozen deterministic atomic result and labels every proposition `deterministic-shadow-enrichment`; it is compatibility backfill, not native generation.

Atomic grounding validates each envelope, prefers native structure, then compatibility structure, then the frozen grounding fallback. It preserves assertion status, exact source span/hash, participant bindings, purpose-versus-destination semantics, and proposition provenance before normalizing into the accepted atomic IR. Structured propositions never create relations. The deterministic relation extractor and `ExplanatoryRelationV36` validator remain downstream and unchanged.

No provider is required: current canonical claim generation is deterministic with optional fixture-backed semantic proposals, and the 40-episode evaluation reads the immutable persisted V3.5 claims.
