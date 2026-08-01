# Narration Rollout Evidence

Evidence version: 1

Status: Awaiting authorized production evidence

Owner: Dark Truth production operator; name must be recorded before execution.

## Promotion rule

Do not change the default from `legacy` to `new` until every required target has
accepted shadow and new-mode evidence, resume is provider-free, forced
regeneration is accepted, and a named rollback release window is scheduled.
`BLOCKED` and `REGENERATION_RECOMMENDED` never count as acceptance.

No command in this document authorizes paid provider calls. Execution requires
separate human approval and a cost cap.

## Required target matrix

The speech/story language surfaces currently recognize English, German,
Spanish, French, Italian, and Portuguese. Dark Truth adapter support for Italian
must be reconciled before promotion; excluding it requires an explicit
production-support decision.

| Locale | Full shadow | Short shadow | Full new | Short new |
| --- | --- | --- | --- | --- |
| `en` | Pending | Pending | Pending | Pending |
| `de` | Pending | Pending | Pending | Pending |
| `es` | Pending | Pending | Pending | Pending |
| `fr` | Pending | Pending | Pending | Pending |
| `it` | Blocked: adapter support decision | Blocked: adapter support decision | Blocked: adapter support decision | Blocked: adapter support decision |
| `pt` | Pending | Pending | Pending | Pending |

Each cell must record episode, source hash, config hash, mode, quality status,
warnings, generation report, execution report, reviewer, and acceptance date.
Use representative real scripts; do not reuse one locale's evidence for another.

## Required runs

1. Shadow baseline for every target, with compatibility promotion disabled.
2. New-mode candidate for every target using the same accepted inputs.
3. Resume each accepted target and prove no provider request occurs.
4. Force one approved full and one approved Short target, then reaccept quality.
5. Inspect status and quality artifacts through the operator-facing CLI.

Accepted statuses are `READY`, or `READY_WITH_WARNINGS` with a recorded reviewer
decision. Evidence must show full/Short isolation and deterministic reuse.

## Rollout selection evidence

Narration routing emits the structured telemetry event
`narration.rollout-selection` when execution telemetry is active. It contains
episode, language, variant, selected mode, route, operation/stage, dry-run state,
and `rollbackSelected`; it contains no narration text or credentials.

A rollback use is exactly `mode=legacy`, `route=monolithic`, `dryRun=false`, and
`rollbackSelected=true`. Dry-runs and direct staged commands blocked by legacy
mode are observable but are not counted as rollback executions.

## Release window

Before default promotion, record:

- release identifier, start, and end;
- named production owner and alternate;
- telemetry report location and query for rollback selections;
- rollback decision procedure and incident reference;
- acceptance that no unwrapped operator script bypasses telemetry.

The monolithic route remains removable only after the named release window ends
with zero rollback selections and source search finds no direct caller.

## Current blockers

- No paid production matrix has been authorized or run.
- No owner, release identifier, or window dates are recorded.
- Italian Dark Truth adapter support differs from current story/speech language
  support.
- Direct CLI execution outside the telemetry wrapper is not centrally observed;
  operator acceptance or enforced wrapping is required before claiming zero use.
