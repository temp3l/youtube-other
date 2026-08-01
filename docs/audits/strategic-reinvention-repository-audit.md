# Strategic Reinvention Repository Audit

Date: 2026-08-01
Branch: `feat/strategic-reinvention-veronica`
Audited commit: `2bc65f7157ddcdf850b47f664e39b87396100ac9`
Status: Phase A complete; read-only findings only

## Inputs

The requested `docs/discovery-packs/veronica-benini/` path does not exist. The nine requested files were read completely from `docs/discovery-packs/veronica-benini-youtube-genre-discovery-pack/`.

Source and tests are authoritative. The root README and `docs.bak` were not used for architecture guidance.

## Verified Repository Assumptions

| Hypothesis                                           | Result                    | Evidence and consequence                                                                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/cli` is the primary operational surface        | Confirmed                 | `apps/cli/bin/mediaforge.js` launches `apps/cli/dist/index.js`; `apps/cli/src/index.ts` is the composition root for nearly every capability package.                                                                                           |
| Relevant packages already exist                      | Mostly confirmed          | `shared`, `domain`, `config`, `story-localization`, `image-generation`, `speech`, `rendering`, `metadata`, `youtube-upload`, `visual-planning`, `observability`, and `dark-truth` exist. Genre, creator-profile, and approval packages do not. |
| Locales are `en/de/es/fr/pt`                         | Confirmed                 | The union is duplicated in domain, shared, story-localization, speech, metadata, config, CLI, and tests. Italian is absent.                                                                                                                    |
| Variants are `full/short`                            | Confirmed                 | Shared domain and workflow contracts use these two variants.                                                                                                                                                                                   |
| Canonical scripts use `languages/script-<locale>.md` | Partly confirmed          | This is authoritative for authored scripts. Runtime narration and compatibility artifacts also use `locales/<locale>/<variant>/script.md`.                                                                                                     |
| Active code uses `createEpisodePathResolver`         | False                     | Modern consumers use it, but active story rewrite and batch code still constructs legacy paths directly.                                                                                                                                       |
| Legacy `script.md` is no longer written              | False                     | Read compatibility is intentional, but some active producers still write legacy layouts.                                                                                                                                                       |
| Conflicting resolvers and stale artifacts remain     | Confirmed                 | `episode-filesystem.ts`, `artifact-path-resolver.ts`, story batch services, and older CLI commands overlap.                                                                                                                                    |
| Packaged CLI may be stale                            | Confirmed                 | `apps/cli/src/index.ts` is newer than local `apps/cli/dist/index.js`; `doctor` does not compare source and build freshness.                                                                                                                    |
| Per-scene audio is inefficient                       | Partly confirmed          | Modern narration is chunked, cached, and bounded by requested concurrency; legacy CLI synthesis still maps chunks to synthetic scene IDs and lacks a configured maximum.                                                                       |
| Image filenames are unsafe                           | Partly mitigated          | Canonical scene IDs and `safeBasename` protect common paths. Remote clip IDs and legacy path construction are less strict.                                                                                                                     |
| Bearer-token telemetry is unsafe                     | Partly mitigated          | Process arguments redact bearer headers. Raw CLI argv, curl URLs/query strings, response headers, absolute paths, and content-bearing debug requests can still be persisted.                                                                   |
| Remote-render schemas are weak                       | Confirmed                 | Worker validation lacks a strict versioned schema, duplicate-ID rejection, full containment checks, dependency hashes, and a maximum concurrency bound.                                                                                        |
| Legacy and current pipelines coexist                 | Confirmed                 | Stories, paths, approvals, workflow execution, and upload each have competing legacy/current paths.                                                                                                                                            |
| Edit-batch semantics are unverified                  | Confirmed and fail-closed | Reference-assisted image batch edits are explicitly blocked pending provider JSONL verification.                                                                                                                                               |
| Stories pipeline is a skeleton                       | Confirmed                 | `stories pipeline` rejects non-dry-run execution.                                                                                                                                                                                              |

## Authoritative Entry Points

- Packaged CLI launcher: `apps/cli/bin/mediaforge.js`
- CLI composition: `apps/cli/src/index.ts`
- Story command registration: `apps/cli/src/story-localization-commands.ts`
- Story planning DAG: `packages/story-localization/src/story-workflow-planner.ts`
- Canonical durable workflow: `packages/workflow-engine`
- Hosted durable execution: `packages/application` and `packages/persistence`
- Canonical episode paths: `packages/shared/src/episode-filesystem.ts`
- Generic approval-bound publisher: `packages/youtube-upload/src/generic-media-publish.ts`
- Active legacy uploader: `packages/youtube-upload/src/index.ts::uploadYoutubeEpisode`

## Current Pipeline DAG

```text
ingest en/full -> rewrite-full -> validate-full -> quality-full
  -> localize each non-English full -> validate-full -> quality-full
  -> short extraction per locale -> validate-short -> quality-short
     -> scenes -> visual plan -> prompts -> images -> thumbnail
     -> audio -> captions
     -> metadata
     -> short render -> publish
  -> full audio -> captions
  -> full metadata
  -> full render -> publish
```

The planner is English-canonical and uses synthetic fingerprints except for authored English ingest. Full render does not depend on its full visual/image stages. Publish depends on render and metadata without rights or approval nodes. The DAG is planning-only; real production commands bypass it.

The separate durable workflow maps episode work to `dark-truth`, while the closed content-profile union contains only `dark-truth` and `mathematics-education`.

## Package Ownership And Dependency Direction

| Package                 | Current authority                                     | Target extension                                                                                    |
| ----------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `domain`                | Strict Zod contracts; no I/O                          | Generic genre, creator, source, blueprint, approval scope, Italian locale, and strategic profile ID |
| `shared`                | Paths, hashing, containment, atomic writes            | Strategic artifact kinds and resolver methods; no orchestration                                     |
| `config`                | Runtime configuration and precedence                  | Generic genre/profile registries and permission-intersection logic                                  |
| `workflow-engine`       | Registry, DAG, state, invalidation, approvals, resume | Strategic tasks, multi-reviewer gates, source/metadata invalidation                                 |
| `strategic-reinvention` | Does not exist                                        | Concrete profile package analogous to `dark-truth`                                                  |
| Capability packages     | Provider-neutral media operations                     | Italian and policy-aware adapters without Veronica-specific branches                                |
| `apps/cli`              | Composition and operator UX                           | Approval commands, strategic composition, compatibility routing, doctor checks                      |

`dark-truth` depends on generic capability packages, so it cannot own reusable Strategic Reinvention abstractions. Creating a second workflow engine or approvals package would contradict the accepted repository architecture.

## Existing Abstractions

- `GenrePolicyRegistry` is runtime-Zod parsed and prompt-aware, but its contract is story/horror oriented and lacks episode modes, approval gates, metrics, visual grammar, and source-rights rules.
- No creator-profile registry or creator-identity contract exists.
- Approval mechanisms coexist:
  1. legacy episode review records;
  2. durable workflow approvals bound to workflow revision and artifact hashes;
  3. generic YouTube publish approvals bound to dry-run evidence.
- Durable workflow approvals are the correct foundation, but currently select only the latest task approval and cannot enforce two distinct reviewers.
- Source ingestion stores platform/transcript metadata, not rights, access tier, transformations, sensitivity, approvals, or creator-source hashes.
- Generic upload supports approval binding, checkpoints, resume, and reconciliation, but has no production CLI caller.

## Upload And Multilingual Audio

The active upload path performs a local completed-report hash check, then calls `videos.insert`. A lost provider response can cause a blind retry and duplicate video. `--force` bypasses the local completed-report check.

The generic publisher persists partial progress and reconciliation evidence, but is unwired. Current upload accepts one video/audio stream and sets `defaultAudioLanguage`; there is no alternate-audio-track capability adapter or channel capability probe.

## Security, Observability, And Resumability Risks

- Top-level execution reports persist raw argv and cwd.
- Curl telemetry persists raw URL and response-header values.
- OpenAI debug logs redact secrets and base64, but may retain source or prompt text.
- Remote-render job/ready manifests have weak runtime validation and unbounded configured concurrency.
- Legacy upload has ambiguous-result duplicate risk.
- Story production is not resumable through the canonical durable workflow because its planner is dry-run only.
- Modern workflow events are append-only and hash/revision aware, but legacy review and upload reports remain separate authorities.
- Unsupported reference-assisted image batch edits correctly fail closed.

## Supplied Specification Conflicts

1. Blueprint approval enums duplicate fingerprint-bound workflow approval state.
2. `beats[].sourceIds` permits an empty list although every beat must trace to a source.
3. Source `approvedAt` and `approvedBy` are optional although production requires them.
4. Source tier `lead-magnet` conflicts with episode tier `lead-generation`.
5. Approval names differ among `final-render`, `render`, and `QA_APPROVED`.
6. Locale fields accept arbitrary strings instead of supported locale types.
7. Rights `allowedUses` and `aiTransformations` are not cross-validated.
8. High-risk second-review requirements are absent from the JSON schemas.
9. Precedence is ambiguous unless permissions merge by intersection.
10. Creator status `discovery` is not publication authorization.
11. Italian-canonical behavior conflicts with the English-canonical story workflow.
12. Single-video multilingual audio is unsupported by the current integration.
13. Existing architecture uses closed workflow profiles; genre and creator must remain separate overlays within a Strategic Reinvention workflow profile.

## Baseline Verification

Commands run during Phase A:

```text
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
  25 passed

pnpm test:focused -- packages/story-localization/src/story-workflow.integration.test.ts
  2 passed

pnpm exec vitest run -c vitest.unit.config.ts --bail=1 \
  packages/story-localization/src/genre-policy.unit.test.ts \
  packages/story-localization/src/story-workflow-locales.unit.test.ts \
  packages/persistence/src/postgres-episode-approval-persistence.unit.test.ts \
  packages/youtube-upload/src/publish-approval.unit.test.ts \
  packages/youtube-upload/src/generic-media-publish.unit.test.ts \
  packages/observability/src/telemetry.unit.test.ts \
  apps/cli/src/mediaforge-bin.unit.test.ts
  41 passed
```

No affected focused failure was found. Repository-wide test, build, lint, and typecheck status remains unverified because broad verification was not authorized.

## Task 00 Baseline Confirmation

On 2026-08-01, execution began on the same audited branch and HEAD. The three bounded baseline commands above were rerun without modification: 25 shared-path tests, 2 story-workflow tests, and 41 policy/persistence/publishing/observability/CLI tests passed. No broad verification or external provider call was performed.
