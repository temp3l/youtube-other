# V3.6 Phase 2.2 bounded LLM shadow

Changed files: V3.6 representative extraction/tests; bounded proposer, cache, experiment runner, fixture, provenance, exports; artifact generator; V3.6 IR/diagnostic docs.

Summary: Fixed Franklin purpose-infinitive movement extraction, then froze deterministic behavior. Added an opt-in two-claim LLM proposer behind the unchanged validator with strict schemas, supplied-ID checks, 40/8 budgets, fail-open handling, and semantic-input caching. Evaluated exactly eight episodes with fixtures. Live experiment: NOT RUN (flag, model, and explicit budgets absent).

Checks: 96 focused V3.6 tests passed; `@mediaforge/history` typecheck passed; targeted ESLint passed; artifact checksums and ZIP integrity passed.

Results: deterministic 26 candidates/19 valid; mocked LLM 9 windows/5 proposals/0 valid; unsupported admissions 0; purpose errors 0; cache replay hits 9.

Risks remaining: live provider behavior and token usage are unmeasured. Upstream grounded propositions remain the admission bottleneck.

Follow-up: review the bounded artifact before deciding whether to improve upstream representation or configure a live rerun. Do not broaden to 40 episodes.

Commit: pending (this commit).
