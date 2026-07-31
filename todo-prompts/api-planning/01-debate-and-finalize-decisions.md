# Debate and Finalize the YouTube API Architecture Plan

Act as an independent architecture review board. The repository has already been analyzed and the planning package is expected under `docs/api-plan/`.

This remains a planning-only session. Do not implement production code.

## Objective

Challenge the existing API plan, identify unsupported assumptions, expose contradictions, and produce a smaller set of explicit operator decisions before implementation begins.

## Multi-agent review

Use independent agents with intentionally different positions:

1. **Simplicity advocate** — prefer a modular monolith, minimal infrastructure, and incremental migration.
2. **Reliability advocate** — prioritize durable execution, idempotency, crash recovery, and strict state transitions.
3. **API product advocate** — prioritize a coherent external contract, developer experience, SDKs, and commercial usability.
4. **Security reviewer** — prioritize tenant isolation, credentials, approval boundaries, abuse resistance, and auditability.

Each agent must review the same plan independently before the lead agent reconciles their findings.

## Required review

Validate that the plan:

- Reuses one canonical application/workflow layer
- Does not preserve duplicate CLI and API implementations
- Does not use CLI subprocess execution as the target architecture
- Defines crash-safe duplicate-publication prevention
- Defines durable and queryable workflow state
- Preserves Dark Truth story-bible and reference-image behavior
- Preserves education curriculum and renderer presets
- Has explicit tenant boundaries
- Has a stable API error and idempotency contract
- Keeps long-running work asynchronous
- Provides a credible single-host migration path
- Avoids premature microservices
- Defines characterization and parity tests before refactoring
- Provides independently reviewable implementation work packages

## Adversarial scenarios

Test the design against:

1. Two identical API requests arrive concurrently.
2. A worker crashes after uploading a video to YouTube but before committing local success.
3. A retry starts while the original worker is still running.
4. A tenant guesses another tenant's asset identifier.
5. A webhook is delivered five times and out of order.
6. A render step finishes but object-storage registration fails.
7. The database is temporarily unavailable during a provider call.
8. A workflow is resumed after code, prompts, or presets changed.
9. A CLI operator and API client mutate the same episode concurrently.
10. A batch has partial failures and is resumed.
11. A user requests cancellation while FFmpeg is rendering.
12. An approval is revoked while a publication job is queued.
13. A malicious source document contains prompt-injection instructions.
14. A provider reports success after the platform timed out.
15. A local-filesystem episode is migrated to object storage.

Document whether the design handles each scenario, where the guarantee lives, and what remains unresolved.

## Outputs

Update:

- `docs/api-plan/20-decision-register.md`
- `docs/api-plan/21-risk-register.md`
- `docs/api-plan/22-implementation-backlog.md`
- `docs/api-plan/PLAN-STATUS.md`

Create:

```text
docs/api-plan/23-independent-architecture-review.md
docs/api-plan/24-operator-approval-checklist.md
```

The operator checklist must contain only decisions that genuinely require product or operational approval. For each decision provide the recommended default and the consequence of accepting it.

Do not implement anything.
