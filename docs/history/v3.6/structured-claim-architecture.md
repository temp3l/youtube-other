# V3.6 structured claim boundary

Repository evidence places canonical claim creation in `structureTrustedScriptClaimsV34`. It emits one deterministic `HistoryClaimV34` per canonical narration unit, assigns claim kind during normalization, binds entity mentions and geographic roles, and persists exact narration spans. V3.5 workflow state serializes that contract as `structured-claims.json`; V3.5 planning and plan hashes consume its existing fields.

Phase 2.5 therefore leaves `HistoryClaimV34` and V3.5 serialization unchanged. A separate `StructuredClaimEnvelopeV36` sits adjacent to the canonical boundary. The native path accepts typed propositions produced with a future V3.6 canonical claim. The historical path wraps only the frozen deterministic atomic result and labels every proposition `deterministic-shadow-enrichment`; it is compatibility backfill, not native generation.

Atomic grounding validates each envelope, prefers native structure, then compatibility structure, then the frozen grounding fallback. It preserves assertion status, exact source span/hash, participant bindings, purpose-versus-destination semantics, and proposition provenance before normalizing into the accepted atomic IR. Structured propositions never create relations. The deterministic relation extractor and `ExplanatoryRelationV36` validator remain downstream and unchanged.

No provider is required: current canonical claim generation is deterministic with optional fixture-backed semantic proposals, and the 40-episode evaluation reads the immutable persisted V3.5 claims.

## Phase 2.6 native integration

`structureTrustedScriptClaimsNativeV36` is the additive canonical-boundary entrypoint. It calls the unchanged V3.4/V3.5 canonical structurer once, resolves typed semantic proposals against the claim and entity bindings created in that same boundary, and returns the original `HistoryStructuredClaimsV34` plus a separate `history-native-structured-claim-sidecar.v1`. The proposal is keyed by canonical narration-unit ID, so the generator does not reconstruct semantics from persisted prose. The accepted `StructuredClaimEnvelopeV36` remains the sole V3.6 structured proposition contract.

Current claim production is deterministic/local. Native fixtures therefore make no provider call, and no second provider request exists. If the boundary later becomes provider-backed, typed propositions belong in that existing response and the sidecar fingerprint must include provider/model identity.

The sidecar cache fingerprint contains claim IDs/text/spans, participant bindings, schema version, native generator version, typed proposals, and provider/model identity when present. It excludes timestamps and media/render/approval metadata. `persistNativeStructuredClaimSidecarV36` reuses a schema-valid sidecar on a fingerprint hit and atomically replaces it when a semantic input changes. The intended persisted filename beside the canonical claim artifact is `structured-claims.v36.native.json`.

Historical V3.5 artifacts have no native-generation sidecar. Their native coverage remains unavailable; Phase 2.6 measures capability only with the eight frozen representative inputs plus native boundary fixtures, while the historical all-40 compatibility census stays unchanged.
