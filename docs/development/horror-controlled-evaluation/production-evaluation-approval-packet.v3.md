# Horror Production Evaluation Approval Packet V3

Status: approved design; generation preflight ready; no provider calls dispatched

Prepared: 2026-07-26

Outcome inspection: not started

V3 preserves the approved v2 metric, threshold, strategy versions, cost ceiling,
and authority. Before inspecting outcomes, it replaces Episode 034, which lacks
accepted canonical Full lineage, with eligible Episode 028. V2 remains immutable
historical evidence.

## Frozen Cohort

| Episode | Full sample | Short sample |
| --- | --- | --- |
| `025-the-endless-backrooms` | `full-025-endless-backrooms` | `short-025-endless-backrooms` |
| `028-the-man-in-the-attic` | `full-028-man-in-the-attic` | `short-028-man-in-the-attic` |
| `041-the-town-that-calls-your-name` | `full-041-town-calls-your-name` | `short-041-town-calls-your-name` |
| `051-the-voice-message-from-tomorrow` | `full-051-voice-message-tomorrow` | `short-051-voice-message-tomorrow` |

Full and Short tracks remain separate and exploratory. The primary metric is
`endingRetention`; the practical improvement threshold is `0.05` absolute.

## Generation Controls

`candidate-generation-preflight.v3.json` binds all eight units to their accepted
cleaned source, canonical Full, and current baseline artifacts. Strategy Short
generation depends on the paired strategy Full output. Every unit is fixed to:

- rollout mode `enforce`;
- one planned first-pass provider call;
- zero retries;
- USD `1.00` per-unit ceiling.

The aggregate ceilings are eight calls and USD `8.00`. The preflight is
dry-run-only and records `providerCallsDispatched: 0`. It does not authorize
provider dispatch or rollout promotion.

## Remaining Sequence

1. Add and validate an execution adapter that atomically enforces the preflight
   call/cost ledger.
2. Obtain explicit authorization before any paid provider dispatch.
3. Generate Full before paired Short, then persist the exact candidate set.
4. Persist separate blind packets/answer keys and collect human ratings.
5. Import only authorized audience aggregates and produce a v3 decision.

Missing evidence remains `remain-shadow`.
