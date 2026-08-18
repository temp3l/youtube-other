# ADR-VERONICA-M4-001: bounded semantic authority

- Status: Experimental
- Date: 2026-08-18
- Owners: strategic-reinvention / Veronica production

## Context

M1–M3 improved source identity, provenance, actor authorization, causal evidence, candidate generation, and deterministic outcome reporting. M3 remains blocked after repeated semantic-heuristic remediation. The immediate retained-value mismatch is repairable, but the repeated pattern suggests deterministic code is being asked to perform editorial interpretation beyond its reliable scope.

## Decision

Evaluate a schema-constrained OpenAI semantic-authority component as an observational escape hatch. The model may classify source meaning and propose grounded visual strategies. It may not write canonical content, authorize actors, select providers, bypass hard gates, determine freshness, mutate caches, or retry semantic disagreement.

Production integration is prohibited unless the bounded experiment satisfies every hard gate and demonstrates material improvement without known-good regression. Even then, integration must remain feature-gated and preserve deterministic fallback.

## Authority model

The existing authority abstraction is extended semantically rather than replaced:

| Required concept | Repository state / extension | Reusable | Rank |
| --- | --- | ---: | ---: |
| Accepted human authority | `ACCEPTED_HUMAN_AUTHORITY` | yes | 1 |
| Current validated model-derived | `CURRENT_MODEL_DERIVED_AUTHORITY` | yes | 2 |
| Current validated deterministic-derived | existing `CURRENT_DERIVED_AUTHORITY`, clarified as `CURRENT_DETERMINISTIC_DERIVED_AUTHORITY` at the M4 boundary | yes | 3 |
| Stale model-derived | `STALE_MODEL_DERIVED_ARTIFACT` | no | 4 |
| Stale deterministic-derived | existing `STALE_DERIVED_AUTHORITY`, clarified as `STALE_DETERMINISTIC_DERIVED_ARTIFACT` | no | 4 |
| Legacy compatibility | existing `LEGACY_COMPATIBILITY_AUTHORITY` | policy-only | 5 |
| Historical artifact | existing `HISTORICAL_NON_AUTHORITY` | no | 6 |
| Provenance mismatch | existing `PROVENANCE_MISMATCH` | no | reject |
| Unknown | existing `UNKNOWN` | no | reject |

Precedence is `accepted human > current validated model-derived > current validated deterministic-derived > stale/legacy/historical`. Rank never overrides deterministic safety: actor authorization, source grounding, schema validation, state/sequencing constraints, duplicate prevention, provider admission, and canonical provenance may reject any model-derived artifact.

Human authority is immutable through M4. A current human envelope wins before cache lookup or provider admission. Policy changes may trigger human review but cannot silently demote or overwrite accepted bytes.

## Separate dimensions

- Semantic authority: who supplied an interpretation and whether it was deterministically validated.
- Freshness: whether all semantic identity inputs still match.
- Cache state: miss, hit, or rejected entry for the same fingerprint.
- Telemetry: attempts, request identifier, token usage, cost, and timestamps.
- Latency: operational measurement only.
- Provider metadata: requested/returned model and reasoning configuration; identity-bearing only where explicitly configured.

Timestamps, latency, cache-hit time, cost-ledger time, and request identifiers never determine semantic truth or fingerprint identity.

## Request identity and replay

The semantic fingerprint includes normalized canonical source, bounded context, semantic schema version, prompt version, planner-policy version, model, reasoning mode/effort, and output-token ceiling. It excludes all telemetry. Replay means returning a validated persisted model-derived artifact for an identical fingerprint; provider nondeterminism is not replay.

## Provider policy

- Endpoint: Responses API only.
- Model: `gpt-5.6-sol` exactly.
- Reasoning: `mode: pro`, `effort: medium`.
- Storage: `store: false`.
- Output: strict JSON Schema, no prose recovery, tools, web search, or fallback model.
- Retry: initial attempt plus at most one transient retry.
- Timeout: bounded per attempt.
- Experiment ceiling: USD 2.50, with conservative reservation before every physical attempt.

The stable system prompt precedes the dynamic source payload. Runtime schema validation remains mandatory after Structured Outputs.

## Validation outcomes

- `PASS`: strict schema, grounded claims/evidence, authorized action owner, no unsupported required action, and all hard invariants pass.
- `ABSTAIN`: the model explicitly abstains or material ambiguity prevents safe authority. Neutral fallback only.
- `REJECT`: malformed/refused output, unsupported invention, owner mismatch, provenance mismatch, stale identity, or any hard-gate failure. No silent repair.

## Consequences

This design adds bounded semantic judgment without deleting deterministic planning. It increases provider cost and latency, creates a new auditable authority class, and requires cache, cost, and stale-state discipline. The experiment remains observational and cannot mutate canonical plans.
