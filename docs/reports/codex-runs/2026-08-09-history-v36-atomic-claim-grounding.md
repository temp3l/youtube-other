# V3.6 Phase 2.3 atomic claim grounding

Changed files: V3.6 atomic grounding schema/grounder/tests; representative shadow evidence integration; provenance and exports; generated grounding contracts; offline artifact generator; V3.6 IR documentation.

Summary: Added deterministic, claim-local atomic propositions with exact span/hash provenance, bounded predicates, assertion status, stable rule IDs, diagnostics, and deterministic IDs. Grounding lowers only exact asserted atoms into the existing evidence union. The proposer taxonomy and `ExplanatoryRelation` validator are unchanged. Evaluation remains limited to the same eight episodes; no V3.5, map, diagram, 40-episode, or live-LLM work was performed.

Checks: 104 focused V3.6 tests passed, including 45 golden fixtures; final atomic/integration check 24 passed. `@mediaforge/history` typecheck passed. Targeted ESLint passed. The repository lint wrapper exposed 13 unrelated pre-existing errors outside changed paths.

Results: deterministic relations remained 19; mocked LLM remained 9 windows/5 proposals/0 admissions. Unsupported admissions, duplicate IDs, cross-episode support, purpose-as-destination, and proper-name fragmentation remained zero.

Risks: bounded normalization intentionally leaves many claims ungrounded; no live-provider behavior was measured.

Follow-up: review the Phase 2.3 artifact before deciding whether a live eight-episode evaluation is worthwhile.
