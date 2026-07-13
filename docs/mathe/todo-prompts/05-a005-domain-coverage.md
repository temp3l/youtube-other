Recommended model: GPT-5/Codex  
Recommended reasoning: high

# Implement A-005: deterministic mathematical domain coverage

Proceed only if A-004 is accepted. Implement only A-005.

Read `AGENTS.md`, `docs/ai-context/context-pack.md`, A-005, F-103/F-106, the accepted
curriculum rollout slice, current TS math schemas/protocol, Python AST/check modules, and
their smallest relevant fixtures/tests. Confirm which capabilities the accepted slice
actually requires before adding nodes or checks.

Implement independent exact verification for required equation systems,
geometry/measurement, functions/graphs, and probability models. Bind explicit domains,
assumptions and units. Never derive truth from a caller-provided expected result. Preserve
fail-closed `unsupported` for every model not explicitly implemented and reviewed. Version
protocol/cache identities when semantics change, and quarantine incompatible old results.

Tests must include valid and invalid systems; required surface/volume/trigonometric cases;
domain, discontinuity and slope attacks; probability trees/path sums/four-field totals;
division by zero; malformed/unknown nodes; and proof that unsupported never passes. Keep
fixtures semantic and do not weaken assertions or broadly regenerate snapshots.

Run the directly affected Python test selection first, then the focused TS protocol or
adapter test, then at most one affected-package typecheck. Stop under the repository's
repair budget and report non-converging cases precisely.

Create `docs/reports/codex-runs/YYYY-MM-DD-a005-domain-coverage.md`. List supported and
still-unsupported models, protocol/cache migration impact, changed paths, exact checks and
results, commit hash or `not committed`, and the A-005 acceptance recommendation.
