# Strategic Reinvention Task 07 Codex Run

Changed paths: `packages/strategic-reinvention/src/adaptation-schema.ts`, `source-adaptation.ts`, `provenance-validation.ts`, focused tests, and the package export.

Implemented deterministic source-led candidate adaptation. Every output line binds to exactly one contiguous runtime-validated byte span; condensation selects or reorders whole spans across the script. Character, word, negation, modality, and multi-span recombination fail. Quote, first-person, and claim spans require current scoped approval cohorts with workflow identity/revision, revocation/rejection, expiry, high-risk, and distinct-actor enforcement. The fingerprint binds full manifests, evidence, profile inputs, policy, blueprint, and candidate. Canonical-script approval changes only that gate; remaining gates derive from effective policy: localization, voice, final-render, and publish. Publication stays false.

Checks: focused source-adaptation suite (6 passed); focused provenance-validation suite (5 passed); strategic package typecheck passed.

Commit: `5f49dc8`. Risks: callers must supply immutable source bytes and complete durable approval ledgers. No provider or publishing action was added.
