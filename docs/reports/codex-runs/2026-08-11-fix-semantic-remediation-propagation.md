# Fix semantic remediation propagation

## Summary

Made `SEMANTIC_EXTRACTION` remediation an authoritative typed replacement. Removed rejected action/consequence copying, added a generic work-versus-recognition mechanism, rebuilt semantic treatment fields explicitly, and prevented action heuristics from overriding remediated ownership. Dependent hashes now change through proposition, treatment, provider projection, and cache identities; unrelated scenes retain their identities.

## Changed paths

- `packages/strategic-reinvention/src/{positioning-visual-contracts,veronica-semantic-quality,veronica-pre-image-semantic-gate,source-grounded-visual-qa}.ts`
- focused unit tests plus `source-grounded-remediation-propagation.integration.test.ts`
- V02 planning/QA artifacts under `episodes/l01-s01-being-good-isnt-enough/`

## Checks

- Source-grounded unit: 35 passed.
- New integration: 1 passed.
- Semantic-gate regression passed; one unrelated existing convergence test failed.
- Strategic-reinvention typecheck, build, affected-file lint, and diff check passed.
- Live QA: V02 PASS; sequence PASS; 2 `gpt-5.4-mini`/low calls, 2,655 input/639 output tokens, about $0.00487 usage cost.

## Risk

The unrelated semantic-auto-remediation convergence test remains failing and was not changed.
