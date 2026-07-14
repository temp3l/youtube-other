# M2-005 fractions and decimals

Summary: Added eight pending-review German standard lesson specifications for
`M5-ZO-017..024`, exact rational/finite-decimal verifier evidence, semantic
fraction-model/number-line contracts, deterministic localization mappings,
adversarial coverage, and an exact review packet. Production activation stays
closed without registered external evidence.

Changed paths: `packages/math-education/src/domain/lesson.ts`,
`packages/math-education/src/lesson/{production-content,fractions-decimals-standard-content,variant-builder,capabilities}.ts`,
`packages/math-education/src/localization/localization.ts`,
`packages/math-education/src/index.ts`, German glossary, Python verifier,
two focused tests, and the M2-005 review packet.

Tests: focused lesson test (3 passed); focused verifier test (1 passed);
`pnpm --filter @mediaforge/math-education typecheck` (passed).

Commit hash: not committed.

Unresolved risks: curriculum/source review and production evidence registration
remain external; no provider or media rendering was run.
