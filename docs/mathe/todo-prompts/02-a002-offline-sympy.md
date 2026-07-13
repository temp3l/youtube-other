Recommended model: GPT-5/Codex  
Recommended reasoning: high

# Implement A-002: reproducible offline SymPy verifier

Proceed only if A-001 is accepted. Implement only A-002 from
`docs/mathe/audits/remediation-backlog.md`; do not begin curriculum work.

Read `AGENTS.md`, `docs/ai-context/context-pack.md`, A-002, F-102, F-108, the current
Python verifier README/project metadata, TS adapter, adapter tests, Python tests, and the
scripts/configuration that actually invoke them. Inspect supported runtime constraints
before selecting Python and wheel tags.

Create a reproducible offline verifier bootstrap with pinned Python compatibility,
SymPy, pytest, transitive dependencies, and hash verification. Provide a wheelhouse
preparation step that may use network only when explicitly run for preparation, and a
runtime setup step that uses the approved wheelhouse with network disabled. Do not add a
broad executable allowlist or any fallback to caller booleans or floating-point checks.
Make missing/incompatible wheels fail with actionable diagnostics.

Cover the real Python suite and TS adapter behavior: success, spawn/crash before stdin,
timeout with descendant termination, stdout/stderr bounds, noisy or malformed output,
and protocol/version/hash/identity mismatch. Keep fixtures small and semantic.

Before edits, state exact files. Run no more than three distinct targeted test commands:
prefer one Python-suite command, one focused adapter command, and at most one affected
package typecheck after they pass. Dependency or wheel downloads require the appropriate
approval; never claim offline reproducibility unless it was actually exercised.

Create `docs/reports/codex-runs/YYYY-MM-DD-a002-offline-sympy.md`. Report tested platform,
Python/ABI, exact commands/results, what was not verified on other platforms, changed
paths, commit hash or `not committed`, and an A-002 acceptance recommendation.
