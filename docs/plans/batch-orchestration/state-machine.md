# Batch Orchestration State Machine

## Existing State To Reuse

- Workflow stage state in `packages/story-localization/src/story-workflow.types.ts`
- Workflow persistence in `packages/story-localization/src/story-workflow-store.ts`
- Existing batch submission state in text and image batch manifests
- Canonical paths in `packages/shared/src/episode-filesystem.ts`

## New State Layers

### Run-Level State

Add a run document persisted in `batches/<run-id>/batch-plan.json` and mirrored into episode workflow state with references to:

- `runId`
- `stage`
- `provider`
- `endpoint`
- `submittedAt`
- `completedAt`
- `downloadedAt`
- `importedAt`
- `validatedAt`
- `status`
- `sourceEpisodeSlugs`
- `itemCounts`
- `failureCounts`
- `retryPlanPath`

### Episode/Output-Level State

Reuse workflow manifests for stage ownership, then add a compact production summary file per episode at:

`episodes/<slug>/state/story-workflow/production-state.json`

It should summarize canonical English status, localization status per language, short status per language, scene-plan status, image status, audio status, render status, blocked reasons, retryable failures, and source run IDs.

## Stage Status Model

Use these run/stage statuses:

- `planned`
- `submitted`
- `running`
- `completed`
- `downloaded`
- `imported`
- `validated`
- `accepted`
- `completed_with_failures`
- `failed`
- `expired`
- `cancelled`
- `import_failed`
- `validation_failed`
- `partially_imported`
- `blocked`

Semantics:

- `completed_with_failures`: provider batch finished and some items failed, but the run still advanced.
- `failed`: infrastructure or stage-level failure stopped further processing.
- `blocked`: downstream work is prohibited for a specific episode/language/profile because required artifacts are missing or invalid.

## Asset Status Model

Use these asset-level states:

- `planned`
- `submitted`
- `completed`
- `downloaded`
- `imported`
- `validated`
- `failed`
- `validation_failed`
- `retry_pending`
- `blocked`

One failed asset must never imply a failed run.

## Canonical Custom ID Convention

Readable import-safe form for new run-level orchestration:

```text
<episode-slug>:<stage>:<language>:<profile>[:<asset-type>:<asset-id>][:retry-rN]
```

Examples:

- `025-the-endless-backrooms:rewrite:en:full`
- `025-the-endless-backrooms:quality:en:full`
- `025-the-endless-backrooms:localize:de:full`
- `025-the-endless-backrooms:short:de:short`
- `025-the-endless-backrooms:scene-plan:en:full`
- `025-the-endless-backrooms:image:en:full:shot:shot-0007`
- `025-the-endless-backrooms:image:de:short:shot:shot-0007`

Rules:

- stage values must map to approved orchestrator stages only
- language must use `en|de|es|fr|pt`
- profile must use `full|short`
- asset ids must use zero-padded forms like `shot-0007`
- uniqueness is run-wide
- parsing must reject extra segments and unsupported stage/profile/language values
- retry plans append `:retry-rN` while linking back to the original custom ID

Existing deterministic internal IDs such as `dte:...` and `dte-img:v2:...` can remain inside the underlying services if required. The orchestration layer should maintain a mapping between human-readable run IDs and provider-facing deterministic IDs where that reduces migration risk.

## Stage Gates

| Downstream stage | Required inputs | Required state | Failure behavior | Retry behavior |
| --- | --- | --- | --- | --- |
| Localization | approved English full script | canonical English approved | block only that episode | retry rewrite/import/validation only for blocked episode |
| Shorts | approved full script for same language | language full approved | block only that language/profile | retry short generation/import/validation |
| Scene plan | approved source script | source script approved | block only that episode/profile | retry scene-plan generation/import/validation |
| Image generation | valid scene plan and image prompts | scene plan accepted | block only affected episode/language/profile | retry failed or validation-failed image assets only |
| Audio generation | validated script | script validation passed | block only affected episode/language/profile | rerun narration pipeline for blocked targets |
| Rendering | validated images and validated audio | image and audio ready | skip blocked outputs when `--only-ready` is set | run repair command or retry blocked upstream asset |

## Path Mapping

Desired conceptual locations map to actual repo paths as follows:

| Concept | Actual repo path |
| --- | --- |
| canonical English full script | `episodes/<slug>/languages/script-en.md` |
| canonical English short script | `episodes/<slug>/languages/short/script-en.md` |
| localized full runtime script | `episodes/<slug>/locales/<lang>/full/script.md` |
| localized short runtime script | `episodes/<slug>/locales/<lang>/short/script.md` |
| full images | `episodes/<slug>/shared/images/generated/` |
| short images | `episodes/<slug>/shared/short/images/generated/` |
| audio | `episodes/<slug>/locales/<lang>/<variant>/audio/` |
| render output | `episodes/<slug>/locales/<lang>/<variant>/renders/<profile>/` |

## State Transition Rules

- provider output is never a downstream input by itself
- import is required before validation
- validation is required before acceptance
- blocked state attaches to the narrowest possible output target
- retries clear `retry_pending` only for the retried items
- successful siblings in the same run remain accepted
