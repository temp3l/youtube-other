# Horror Production Evaluation Approval Packet V2

Status: approved and represented by `evaluation-manifest.v2.json`
Prepared: 2026-07-25
Outcome inspection: not started

This packet records the decisions represented by the hash-bound v2 manifest.
It is not production evidence or permission to change the rollout default.

## Recommended Decisions

- Primary metric: `endingRetention`.
- Practical improvement threshold: `0.05` absolute.
- Tracks: Full and Short remain separate and are never pooled.
- Strategy versions: `current-production-baseline` versus
  `horror-affect-strategy-v1`.
- Assignment: deterministic seeded blind assignment, two baseline and two
  strategy units per format.
- Interpretation: this minimum cohort is exploratory. It cannot independently
  authorize promotion.
- Rollout: retain `shadow` unless every source-plan gate and explicit human
  approval pass.

## Proposed Cohort

All candidates have an English Full artifact carrying generated-full
provenance and a paired English Short artifact.

| Episode | Full sample unit | Full band | Short sample unit | Short band |
| --- | --- | --- | --- | --- |
| `025-the-endless-backrooms` | `full-025-endless-backrooms` | `over-180s` | `short-025-endless-backrooms` | `under-60s` |
| `034-not-my-reflection` | `full-034-not-my-reflection` | `over-180s` | `short-034-not-my-reflection` | `under-60s` |
| `041-the-town-that-calls-your-name` | `full-041-town-calls-your-name` | `over-180s` | `short-041-town-calls-your-name` | `under-60s` |
| `051-the-voice-message-from-tomorrow` | `full-051-voice-message-tomorrow` | `over-180s` | `short-051-voice-message-tomorrow` | `under-60s` |

Common proposed dimensions are locale `en-US`, manifest-safe genre policy ID
`genre-policy-unknown` (the runtime policy is `genre-policy/unknown`), and
audience type `mixed`. Episode
`023-the-vanishing-hitchhiker` is the reserve and may replace a unit only before
the immutable manifest is persisted.

## Pre-registered Exclusions

- Artifact fails deterministic source, lineage, rule, rename-map, or ending
  validation before blind assignment.
- Artifact changes after assignment or its accepted lineage becomes stale.
- Provider or persistence failure prevents a complete paired review packet.
- Audience aggregate lacks matching authorization, sample ID, format, arm, or
  observation window.
- Title or thumbnail differs between arms when CTR is reported; CTR then remains
  descriptive and cannot support the story decision.

Exclusions are applied separately by format. They never justify moving a unit
between arms after outcomes are inspected.

## Required Human Authorization

These values are resolved for the bounded evaluation:

| Required value | Authorized value |
| --- | --- |
| Maximum incremental provider calls | `8` |
| Maximum incremental cost in USD | `8.00` |
| Budget reference | `story-evaluation-cap-2026-07-25` |
| Analytics-import authority ID | `workspace-user` |
| Analytics-import scope reference | `aggregate-horror-evaluation-v2` |
| Rollout-change authority ID | `workspace-user` |
| Rollout-change scope reference | `config-only-horror-rollout-v2` |
| Preregistering actor ID and role | `workspace-user`; `operator` |

The call limit covers one first-pass strategy candidate for each of four Full
and four Short sample units. It provides no repair-call allowance. A failed
candidate is excluded under the preregistered rule and cannot be retried without
new authority. The USD ceiling applies across all attempts.

## Activation Sequence

1. Reconfirm the v2 manifest hash and frozen four-episode cohort.
2. Generate the eight first-pass strategy candidates within the approved
   provider-call and USD ceilings.
3. Build and persist the exact manifest-bound candidate set.
4. Persist separate seeded Full/Short reviewer packets and answer keys.
5. Import only explicitly authorized aggregate audience metrics.
6. Produce a versioned decision. Missing evidence or approval remains
   `remain-shadow`.
