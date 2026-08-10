# Strategic Reinvention Operator Guide

## Scope

This guide covers the canonical `veronicabenini` content profile. The source
configuration identifiers `veronica-benini` and `strategic-reinvention` are
compatibility aliases only and must not be persisted as workflow or artifact
identity. Production remains **blocked by default** until written activation,
rights, supplied-human voice, and revision-scoped approval evidence are recorded.

## Package ownership

| Area | Package / path |
|------|----------------|
| Genre + creator policy | `packages/strategic-reinvention/config/` |
| Profile gate | `packages/strategic-reinvention/src/profile.ts` |
| Supplemental media | `packages/veronica-media/` |
| Episode bridge | `packages/strategic-reinvention/src/supplemental-media-bridge.ts` |
| Workflow DAG | `packages/strategic-reinvention/src/full-task-definitions.ts` |
| Episode orchestrator | `packages/strategic-reinvention/src/episode-pipeline.ts` |
| Workflow DAG registry | `packages/strategic-reinvention/src/task-registry.ts` |
| Multilingual package | `packages/strategic-reinvention/src/multilingual-package.ts` |
| Publish dry-run | `packages/strategic-reinvention/src/publishing.ts` |
| YouTube capability | `packages/youtube-upload/src/multilingual-audio-capability.ts` |

## Episode layout

```text
episodes/<episode-id>/
  blueprint.json
  languages/script-it.md
  languages/script-en.md
  languages/script-es.md
  languages/short/script-it.md
  sources/content/<source-id>/*
  sources/manifests/*
  sources/approvals/source-evidence.json
  state/veronicabenini/acceptance-evidence.json
  state/veronica-media/
  locales/<locale>/<variant>/...
```

Paths are resolved through the shared artifact resolver. Flat strategic source
paths are read-only compatibility candidates and require a valid manifest;
operators must write new source originals to the nested canonical layout.

## Operator commands

### Supplemental media

```bash
pnpm mediaforge -- veronica-media pilot --workspace /tmp/pilot --json
pnpm mediaforge -- veronica-media run --workspace /tmp/episodes --episode-id episode-001 --json
pnpm mediaforge -- veronica-media render --workspace /tmp/episodes --episode-id episode-001 --aspect 16:9
pnpm mediaforge -- veronica-media render --workspace /tmp/episodes --episode-id episode-001 --aspect 9:16 --execute
pnpm mediaforge -- veronica-media validate --plan state/veronica-media/veronica-media-plan.json
pnpm mediaforge -- veronica-media review-pack --workspace episodes/veronica-benini --scaffold-missing --content-matrix docs/discovery-packs/veronica-benini-youtube-genre-discovery-pack/06-samples/content-matrix.csv --bulk-dir artifacts/veronica-benini/approval-packs --json
```

Or use the package script:

```bash
pnpm veronica:review-packs
```

`--execute` is required for host FFmpeg rendering. Default render mode compiles
commands only.

### Workflow

The `strategic-episode` resource registers the full 20-task episode DAG
(`strategic-reinvention.episode`): source approval through adaptation,
localization, supplemental media, render evidence, multilingual packaging,
and publish dry-run.

```bash
pnpm mediaforge -- workflow strategic-episode profile-fixture
pnpm mediaforge -- workflow strategic-episode graph --episode episode-001 --unit-root /tmp/episodes/episode-001
pnpm mediaforge -- workflow validate
```

Programmatic pilot:

```bash
pnpm test:focused -- packages/strategic-reinvention/src/pilot.integration.test.ts
```

The pilot writes `state/veronicabenini/acceptance-evidence.json`. Verify its
canonical profile, production/workflow revisions, configuration and dependency
hashes, source provenance, locale-neutral visual reuse, source invalidation,
preserved approval-history hash, and redacted fail-closed release evidence.

## Approvals and invalidation

- Required gates: `source`, `canonical-script`, `localization`, `voice`,
  `final-render`, `publish`.
- High-risk topics require a second reviewer before publish evidence is valid.
- Source-byte changes invalidate downstream supplemental-media state and publish
  fingerprints.
- `autoPublish` and `notifySubscribers` remain **false** for this profile.

## Multilingual audio capability

The capability report distinguishes:

- `supported` — explicit provider evidence confirms alternate audio tracks.
- `unsupported` — explicit evidence shows alternate audio is unavailable.
- `unknown` — no evidence; **publication stays blocked**.

The profile prefers `single-video-with-reviewed-audio-tracks`. Silent fallback to
separate public videos is forbidden.

## Publishing safety

- Use the strategic multilingual publish seam (`runStrategicPublishDryRun`).
- The legacy `uploadYoutubeEpisode` path is blocked for `strategic-reinvention`.
- Dry-run publication requires current render, metadata, rights, and approval
  fingerprints. Missing evidence returns `dry-run-blocked` with stable blocker
  codes.
- Ambiguous provider outcomes require reconciliation before retry.
- Pattern forks require a persisted analytics observation whose configuration,
  dependency, and provenance identities exactly match the fork request.
- Analytics comparisons are explicitly `observational-non-causal`; they cannot
  mutate profile policy or dispatch a provider.

## Recovery and handoff

1. Keep the original episode revision and approval history immutable.
2. Resume with the same idempotency key only for the same request identity.
3. On source changes, expect downstream visual-plan invalidation while unrelated
   approved/cache-compatible artifacts remain available.
4. For ambiguous publication outcomes, run read-only reconciliation; never issue
   a second provider mutation until the stored intent is resolved.
5. Treat redacted failure codes as operator routing evidence. Inspect referenced
   revision and artifact IDs, not raw source text or credentials.

## Limitations (explicit)

- Creator profile status is `discovery`; live production is blocked.
- Synthetic narration, generated likeness, and voice cloning are disabled.
- YouTube alternate-audio API behavior is not claimed without measured evidence.
- Production task bindings remain fail-closed until each shared capability is
  explicitly composed and its external activation evidence is approved.

## Mocked operator dry run

```bash
pnpm test:focused -- packages/strategic-reinvention/src/pilot.integration.test.ts
```

The pilot fixture proves resume, source invalidation, supplemental-media DAG
registration, and dry-run-only publication with zero provider mutations.
