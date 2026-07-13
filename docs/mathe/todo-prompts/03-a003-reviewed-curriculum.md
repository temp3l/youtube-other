Recommended model: GPT-5/Codex  
Recommended reasoning: high

# Implement A-003: truthful reviewed curriculum slice

Proceed only if A-002 is accepted. Implement only A-003 from the remediation backlog.

Read `AGENTS.md`, `docs/ai-context/context-pack.md`, A-003/F-103, and only the curriculum
source, schema, tests, and relevant curriculum documentation needed for the selected pilot
slice. Inspect the current release, source registry, prerequisite graph, state overrides,
hashing, migration policy, and tests before editing.

Define the smallest truthful rollout slice needed for the provider-free pilot. Promote
only evidence that has actually received editorial review. Do not invent source hashes,
official provenance, prerequisite approval, state placement, legal authority, or reviewer
sign-off. Never rewrite published IDs; use append-only migrations. Keep unresolved state
claims explicitly out of rollout scope and production-blocking.

If required review evidence or a rollout-scope decision is absent, stop before modifying
claims and give the human a concise checklist of exact decisions/evidence needed. It is
acceptable to improve validation and tests while leaving release status blocked, but do
not call A-003 accepted without the review evidence.

Test the real release for strict schema, hashes/provenance, unknown fields/enums, duplicate
IDs, graph errors with useful cycle paths, stable order, and override restrictions. Use a
single focused test command where tests share configuration, followed by at most one
affected-package typecheck.

Create `docs/reports/codex-runs/YYYY-MM-DD-a003-reviewed-curriculum.md`. Record the exact
approved slice, evidence source, exclusions, changed paths, commands/results, remaining
editorial blockers, commit hash or `not committed`, and the acceptance recommendation.
