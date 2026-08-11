# Canonical PublishEpisode Execution Prerequisite

Date: 2026-08-11

Verdict: `CANONICAL_PUBLISH_EXECUTOR: COMPLETE`

The inspected HEAD was `dc060336046a1d5dd2d8af2e75c4a69db02972de`, materially newer than the audit's `140b3b3`. Existing unrelated worktree changes were preserved.

## Before and after

Before:

```text
youtube upload CLI
→ production-caller attribution only
→ uploadYoutubeEpisode
→ retrying executeYoutubeMutationSequence
→ videos.insert
```

Canonical `darktruth.publish` was registered but deliberately unbound.

After:

```text
darktruth.publish canonical implementation
→ authoritative publication-context port
→ CanonicalPublishEpisodeExecutor
→ PostgresPublicationIntentRepository-compatible port
→ intent admission + intent/channel fences + authority revalidation
→ CanonicalYoutubePublicationMutation
→ exactly one videos.insert
→ published OR reconciliation_required
→ read-only PublicationReconciliationWorker
```

The legacy CLI path is intentionally unchanged and remains noncanonical pending an authoritative workspace/project/run/approval/credential resolver.

## Existing primitives reused

- `PostgresPublicationIntentRepository.admit`, `getForEpisode`, `claimIntentLease`, `beginExecution`, `markPublished`, `markFailed`, and `markReconciliationRequired`.
- `PostgresPublicationChannelLeaseRepository.claim`, `heartbeat`, and `release`.
- `PublicationReconciliationWorker` and `PostgresPublicationReconciliationStore`.
- `YoutubePublicationEvidenceLookup` and `youtubePublicationRecoveryMarker`.
- Existing workflow `TaskExecutionContext` run, attempt, cancellation, and lease-fence identities.

No second publication state machine or persistence schema was introduced.

## Safety behavior

- Runtime schemas require canonical workspace/project/run/episode/task/attempt, approval, actor, credential, artifact, target, and recovery bindings.
- Stable metadata and aggregate artifact hashes bind provider input to admitted assets.
- Admission happens before lease acquisition; `beginExecution` revalidates approval, principal, credential, artifact, schedule, and both fences before provider dispatch.
- A channel heartbeat immediately precedes the provider boundary; a stale fence produces a pre-effect terminal failure and zero provider calls.
- `videos.insert` is invoked once without `withYoutubeRetry`. Every rejection or missing video ID after invocation is ambiguous.
- An `executing` intent observed after restart is transitioned with its persisted execution fence to `reconciliation_required`, then only read-only reconciliation runs. It never returns to `pending` and never dispatches another upload.
- Exactly one recovery-marker match resolves automatically; zero or multiple matches remain uncertain.
- Filesystem-legacy task contexts (`leaseFence === null`) cannot execute `darktruth.publish`.
- Logs contain publication/run/task/episode/attempt/fence/result identity and exclude credentials.

## Mutation audit

| Path | Purpose | Semantics | Canonical |
| --- | --- | --- | --- |
| `packages/youtube-upload/src/youtube-mutation-seam.ts` `publishYoutubeVideoOnce` | New publication create | One `videos.insert`; rejection is ambiguous | Yes |
| Same file `executeYoutubeMutationSequence` | Legacy/generic mutation sequence | `videos.insert` may retry by configured budget | No |
| `packages/youtube-upload/src/index.ts` `uploadYoutubeEpisode` | Legacy episode upload; called by CLI | Uses retrying sequence with two retries | No |
| `packages/youtube-upload/src/generic-media-publish.ts` | Exported generic adapter; no non-test caller found | Uses retrying sequence with two retries | No |
| `apps/cli/src/index.ts` | Only non-test direct `uploadYoutubeEpisode` caller found | Legacy direct production path | No; pending migration |

## Changed files

- `packages/workflow-engine/src/publish-episode.ts`, `src/index.ts`: shared typed command/result, schemas, deterministic metadata/asset identity.
- `packages/application/src/publish-episode.ts`, `src/index.ts`: durable canonical executor and ports.
- `packages/youtube-upload/src/youtube-mutation-seam.ts`, `src/index.ts`: one-shot provider boundary and concrete hash-validating adapter.
- `packages/dark-truth/src/canonical-publication-task-adapter.ts`, `canonical-task-composition.ts`, `src/index.ts`: thin executable task and full canonical composition.
- Focused unit tests beside application, YouTube mutation seam, and Dark Truth composition.

## Tests and checks

- `pnpm test:focused -- packages/application/src/publish-episode.unit.test.ts` — 6 passed (after building the changed workflow-engine package so workspace runtime exports were current).
- `pnpm test:focused -- packages/youtube-upload/src/youtube-mutation-seam.unit.test.ts` — 3 passed; rerun after effect-boundary catch tightening also passed.
- `pnpm test:focused -- packages/dark-truth/src/canonical-task-composition.unit.test.ts` — 3 passed.
- `pnpm --filter @mediaforge/workflow-engine --filter @mediaforge/application --filter @mediaforge/youtube-upload --filter @mediaforge/dark-truth typecheck` — passed.
- `git diff --check` — passed before the final report.

## Risks and follow-up

The full composition is executable when supplied a trusted `DarkTruthPublicationContextPort`, but no existing production component can authoritatively resolve all required bindings for the legacy CLI. The smallest next task is to implement that database/manifest-backed resolver and route `youtube upload` through `createDarkTruthCanonicalTaskImplementations`. Do not supply default identities. Thumbnail and playlist mutations remain outside this prerequisite's one-shot video-create boundary. Speech was not modified.
