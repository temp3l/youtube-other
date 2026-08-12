# Veronica 01A semantic-plan hash integrity repair

## State

`SAFE_FOR_SECOND_01A_PAID_QA_CANARY`

## Root cause

Classification: `HASH_LIFECYCLE_ENFORCEMENT_GAP`. Multiple mutation-capable plan finalizers wrote `planHash` ad hoc and neither plan persistence nor QA admission asserted the self-hash contract. Thus a stale hash could persist and be admitted. Static evidence cannot prove which historical writer produced `e6ca…`; the owning defect is now fail-closed.

## Hash contract and changes

`canonicalJson` recursively sorts keys and omits `undefined`; `stableHash` is SHA-256. `semanticPlanHashInput` is every persisted plan field except `planHash`; `finalizeSemanticPlanHash` is the sole rehash boundary; `assertValidSemanticPlanHash` guards admission. Updated: `positioning-visual-semantics`, resolver, planner, gate, beat materializer, prompt compiler, production adapter, and focused tests. The adapter adds explicit deterministic re-finalization and pre-QA admission; QA execution no longer creates admissions.

## Artifact identity

Before: source `4e82a65208256d74b2171c4475ee624d9506cfd6f0b21b1f055074d4062c7503`; WAV `2dfc4193f3b325d98bb972d64af168b8dddf9d7f34d267710144965be6190622`; timing `67e2a4539d37d41e6cf574c73e360697cb294d037243bdd1be3daf3c6c7ccbb2`; file `e6ca058ebb9f7f2da26d1b23e65e4096c310b5de025be0780b94fdbe6a075c75`; embedded `ea2e79c5662a870de95b9a42b43041d9512d2fccb3653b0de1328df22b5f27c4`; body `4e8a154139c60da019e15c70dd41ef8a7b8a11ddef8d9d2f57b0e66b1189d133`; beat `e410c90290846a4164933aa5de5f6d177162428b1818fd2edd4f72fc8ba97b92`; projection `bd29f6cb60c2fa59258b83c9ef41f0a77886ef950cd919341370a3eda4b70c1e`; admission `3bac8b593b335a82890e9ba8f06b2eac5f4aca9b80f0a2bba6595c37954b47ce`; revision `77fa6f3b7249c37bbea7e468128971caa935159b0fc341ef6f6056897cf530e6`.

After: source/WAV/timing/beat/projection/revision unchanged; file `70031a1f20001c500aa3af3b9ddc93fda90b386a635316fd385b7934461ce069`; embedded/body `4e8a154139c60da019e15c70dd41ef8a7b8a11ddef8d9d2f57b0e66b1189d133`; admission `87b5feb7dc8620836061832db031385f367920fe0246b7df90e7ef72db8efcbe`. `semanticPlanHash == recomputedSemanticPlanBodyHash: YES`. `SEMANTIC_CONTENT_UNCHANGED` (only `planHash` changed).

## Derived artifacts and QA

Beat plan and prompt projection: `PRESERVED` (their material identities are unchanged). Semantic/beat/provider/readiness gates: `PASS`; prompts 13/13; placeholders 0; contaminated motifs 0. Old admission was deleted on re-finalization, not rewritten; explicit local re-admission created the new identity. Existing QA result retains its old admitted identity as historical evidence.

Prior paid cache records: Mini/low scene batch (7 scenes), Mini/low S07, Mini/low beat batch (7 beats), and Terra/medium HOOK-B04 escalation are all `SAFE_IDENTITY_MATCH`: old/new role/schema/model/reasoning/payload key and revision `77fa…30e6` match, while old/new admissions differ. Reuse permitted: YES. Six beats and sequence remain misses. Unsafe reuse: 0.

QA-only counters: planner 0; finalizer 0; semantic-plan writes 0; beat writes 0; prompt regeneration 0; admission refresh 0. Short budget: 6 provider requests, `$0.40`, 60,000 input, 20,000 output; six unresolved beats micro-batch to one request (batch size 7), sequence is separate, scheduler owns retries. CLI help now derives 6/20,000 from runtime defaults.

## Validation

- resolver self-hash suite: 8/8 PASS.
- adapter admission/purity suite: 14/14 PASS.
- QA/cache/gate/composition/CLI suite: 109/109 PASS.
- strategic-reinvention typecheck, targeted ESLint, `git diff --check`: PASS.

OpenAI calls: 0  
paid QA calls: 0  
TTS calls: 0  
image calls: 0  
thumbnail calls: 0  
render calls: 0  
publication calls: 0  
playlist calls: 0  
cost: `$0`

`NEXT GATE: SECOND_01A_PAID_QA_CANARY`  
`AUTHORIZATION REQUIRED: YES`  
`DO NOT RUN AUTOMATICALLY`
