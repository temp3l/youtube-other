# V3.6 structured claim boundary

Repository evidence places canonical claim creation in `structureTrustedScriptClaimsV34`. It emits one deterministic `HistoryClaimV34` per canonical narration unit, assigns claim kind during normalization, binds entity mentions and geographic roles, and persists exact narration spans. V3.5 workflow state serializes that contract as `structured-claims.json`; V3.5 planning and plan hashes consume its existing fields.

Phase 2.5 therefore leaves `HistoryClaimV34` and V3.5 serialization unchanged. A separate `StructuredClaimEnvelopeV36` sits adjacent to the canonical boundary. The native path accepts typed propositions produced with a future V3.6 canonical claim. The historical path wraps only the frozen deterministic atomic result and labels every proposition `deterministic-shadow-enrichment`; it is compatibility backfill, not native generation.

Atomic grounding validates each envelope, prefers native structure, then compatibility structure, then the frozen grounding fallback. It preserves assertion status, exact source span/hash, participant bindings, purpose-versus-destination semantics, and proposition provenance before normalizing into the accepted atomic IR. Structured propositions never create relations. The deterministic relation extractor and `ExplanatoryRelationV36` validator remain downstream and unchanged.

No provider is required: current canonical claim generation is deterministic with optional fixture-backed semantic proposals, and the 40-episode evaluation reads the immutable persisted V3.5 claims.

## Phase 2.6 native integration

`structureTrustedScriptClaimsNativeV36` is the additive canonical-boundary entrypoint. It calls the unchanged V3.4/V3.5 canonical structurer once, resolves typed semantic proposals against the claim and entity bindings created in that same boundary, and returns the original `HistoryStructuredClaimsV34` plus a separate `history-native-structured-claim-sidecar.v2`. The proposal is keyed by canonical narration-unit ID, so the generator does not reconstruct semantics from persisted prose. The accepted `StructuredClaimEnvelopeV36` remains the sole V3.6 structured proposition contract.

Current claim production is deterministic/local. Native fixtures therefore make no provider call, and no second provider request exists. If the boundary later becomes provider-backed, typed propositions belong in that existing response and the sidecar fingerprint must include provider/model identity.

The sidecar cache fingerprint contains claim IDs/text/spans, participant bindings, schema version, native generator version, typed proposals, and provider/model identity when present. It excludes timestamps and media/render/approval metadata. `persistNativeStructuredClaimSidecarV36` reuses a schema-valid sidecar on a fingerprint hit and atomically replaces it when a semantic input changes. The intended persisted filename beside the canonical claim artifact is `structured-claims.v36.native.json`.

Historical V3.5 artifacts have no native-generation sidecar. Their native coverage remains unavailable; Phase 2.6 measures capability only with the eight frozen representative inputs plus native boundary fixtures, while the historical all-40 compatibility census stays unchanged.

## Phase 2.7 process and temporal semantics

`history-structured-claim.v2` adds only `process-sequence` and `precedes`. A process sequence requires one process participant and at least two claim-explicit steps with unique, contiguous one-based `stepOrder`; neither array position nor an unordered conjunction establishes order. `precedes` requires distinct claim-local before/after participants. It records chronology only and cannot be lowered as causal evidence.

The native generator is `history-native-structured-claim-generator.v2`. Its sidecar fingerprint includes the structured schema, generator, canonical claim content/spans, bindings, and typed proposal, so V1 sidecars invalidate while unrelated media changes do not. Direct atomic projection uses `history-atomic-claim-grounding.v2`, preserves ordered steps or temporal direction, assertion status, exact source span/hash, participant bindings, and the native structured proposition ID.

## Phase 2.8 process and temporal candidate projection

The downstream V3.6 candidate seam now accepts only two additional direct forms: asserted `process-sequence` atoms become `process` candidates, and asserted `precedes` atoms become `temporal-sequence` candidates. Candidate provenance retains the support claim, atomic grounding ID, structured proposition ID, projection rule, assertion status, and exact atomic span. No prose parsing or cross-claim composition participates.

Process candidates use the atom's ordered steps as semantic authority. Synthetic process-container labels remain non-authoritative grouping metadata and are excluded from relation participants and evidence. Temporal and process candidates never imply causality. The relation contract, semantic identity rules, evidence fingerprint, and `ExplanatoryRelationV36` validator are unchanged.
