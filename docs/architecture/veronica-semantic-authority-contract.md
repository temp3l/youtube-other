# Veronica semantic-authority contract

## Version

`veronica-semantic-beat-plan.v1`

Schema evolution requires a new version and invalidates model-derived cache identity. Unknown fields are rejected at the provider schema and again at runtime.

## Input boundary

One logical case contains:

- `caseId`: experiment-local identity
- `source`: the minimum canonical source span needed for judgment
- `contextBefore` and `contextAfter`: bounded adjacent context, possibly empty

No repository paths, secrets, environment values, unrelated documents, or generated assets are sent. Source and context are normalized only for stable line endings and insignificant surrounding whitespace; meaning-bearing punctuation and wording remain intact.

## Output fields

- `schemaVersion`: exact contract version.
- `semanticIntent`: one of `retained_value`, `input_output_flow`, `ownership_transfer`, `causal_mechanism`, `state_change`, `environmental_action`, `comparison`, `manifestation`, or `other`.
- `subject`: source-grounded subject or `null`.
- `actionOwner.type`: `person`, `object`, `environment`, `abstract`, or `none`.
- `actionOwner.sourceReference`: exact supporting source/context substring or `null` when the owner is `none`.
- `semanticClaims`: concise claims, each with an exact `sourceEvidence` substring.
- `visualStrategies`: bounded proposals with a strict family enum, description, meaning-preservation flag, and unsupported-action flag.
- `forbiddenInterpretations`: interpretations the source does not authorize.
- `ambiguity`: `none`, `low`, or `material`.
- `abstain`: legitimate no-authority result.
- `abstentionReason`: required when abstaining; otherwise `null`.

The schema does not require an actor or visualizable interpretation. An empty strategy list is valid only for abstention or material ambiguity.

## Deterministic invariants

The validator rejects or abstains when:

- schema parsing fails or fields are unknown;
- a claim’s evidence is not an exact source/context substring;
- an action-owner reference is not source-grounded;
- a strategy requiring unsupported action is proposed as meaning-preserving;
- material ambiguity is presented as non-abstaining authority;
- abstention fields contradict each other;
- no claims or strategies exist for a non-abstaining result;
- expected accepted-human intent/owner controls would be contradicted;
- a case-level forbidden owner type is selected.

Validation emits `PASS`, `ABSTAIN`, or `REJECT` with typed reasons. Model confidence, latency, timestamps, and cache status never relax an invariant.

## Authority artifact

A persisted model-derived artifact binds the validated plan to:

- semantic fingerprint;
- schema, prompt, and planner-policy versions;
- requested and returned model;
- reasoning mode and effort;
- provider request identifier when present;
- token usage and estimated cost;
- creation time;
- `CURRENT_MODEL_DERIVED_AUTHORITY` status.

Telemetry is stored beside, not inside, the fingerprint inputs. Cache replay revalidates the complete artifact and fingerprint before reuse.
