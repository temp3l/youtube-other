# Strategic Reinvention Operator Guide

## Scope

This guide covers the Veronica Benini (`veronica-benini`) creator profile on the
`strategic-reinvention` genre. Production remains **blocked by default** until
written activation and rights evidence are recorded.

## Package ownership

| Area | Package / path |
|------|----------------|
| Genre + creator policy | `packages/strategic-reinvention/config/` |
| Profile gate | `packages/strategic-reinvention/src/profile.ts` |
| Supplemental media | `packages/veronica-media/` |
| Episode bridge | `packages/strategic-reinvention/src/supplemental-media-bridge.ts` |
| Workflow DAG slice | `packages/strategic-reinvention/src/task-registry.ts` |
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
  sources/content/*
  state/veronica-media/
  locales/<locale>/<variant>/...
```

Paths are resolved through `createEpisodePathResolver`. Legacy story paths are
read-compatible only; strategic write targets use the layout above.

## Operator commands

### Supplemental media

```bash
pnpm mediaforge -- veronica-media pilot --workspace /tmp/pilot --json
pnpm mediaforge -- veronica-media run --workspace /tmp/episodes --episode-id episode-001 --json
pnpm mediaforge -- veronica-media render --workspace /tmp/episodes --episode-id episode-001 --aspect 16:9
pnpm mediaforge -- veronica-media render --workspace /tmp/episodes --episode-id episode-001 --aspect 9:16 --execute
pnpm mediaforge -- veronica-media validate --plan state/veronica-media/veronica-media-plan.json
```

`--execute` is required for host FFmpeg rendering. Default render mode compiles
commands only.

### Workflow

```bash
pnpm mediaforge -- workflow strategic-episode profile-fixture
pnpm mediaforge -- workflow strategic-episode graph --episode episode-001 --unit-root /tmp/episodes/episode-001
pnpm mediaforge -- workflow validate
```

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

## Limitations (explicit)

- Creator profile status is `discovery`; live production is blocked.
- Synthetic narration, generated likeness, and voice cloning are disabled.
- YouTube alternate-audio API behavior is not claimed without measured evidence.
- Full strategic DAG beyond supplemental media remains staged; other genre
  workflows are unchanged.

## Mocked operator dry run

```bash
pnpm test:focused -- packages/strategic-reinvention/src/pilot.integration.test.ts
```

The pilot fixture proves resume, source invalidation, supplemental-media DAG
registration, and dry-run-only publication with zero provider mutations.
