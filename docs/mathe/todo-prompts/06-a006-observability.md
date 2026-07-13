Recommended model: GPT-5/Codex  
Recommended reasoning: high

# Implement A-006: structured math observability and redaction

Proceed only if A-005 is accepted. Implement only A-006.

Read `AGENTS.md`, `docs/ai-context/context-pack.md`, A-006/F-105, the existing
observability package/contracts, and the math workflow, batch, verifier, render and CLI
boundaries. Reuse repository conventions rather than creating a parallel logging system.

Add a bounded structured context carrying the required correlation, batch, release,
skill, lesson, variant, language, stage, provider, model/version, attempt, duration,
cache, and cost fields. Every success, failure, and retry must have stable error
categorization; persisted state must link correlation IDs. Unknown cost is `null` with a
warning, never a guessed zero.

Centralize redaction and bounds. Never log secrets, authorization/cookie headers,
environment dumps, Base64, binary buffers, or oversized request/response payloads. Ensure
debug-sink disablement retains minimal redacted errors and correlation IDs. Avoid logging
mathematical artifact contents when identifiers/hashes suffice.

Batch compatible cases into one focused test file/command covering context completeness,
retry/duration/cost, unknown pricing, and API-key/token/header/Base64/binary/oversize
redaction. Add at most one focused integration check and one affected-package typecheck.

Create `docs/reports/codex-runs/YYYY-MM-DD-a006-observability.md`. Record fields and
boundaries covered, redaction limits, changed paths, exact commands/results, residual leak
risks, commit hash or `not committed`, and the A-006 acceptance recommendation.
