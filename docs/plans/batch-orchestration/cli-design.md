# Batch Orchestration CLI Design

## CLI Design Principles

- Reuse `apps/cli/src/story-localization-commands.ts` and `apps/cli/src/images-batch-commands.ts` instead of introducing a second disconnected entry point.
- Add human-facing `stories batch`, `stories images batch`, `stories production`, `stories audio`, and `stories render` wrappers that delegate to the existing services.
- Keep current low-level commands working until the new wrappers are stable.

## Story Batch Commands

| Target command | Existing base | Implementation direction |
| --- | --- | --- |
| `stories batch plan --stage en-full-rewrite --episodes 025-050 --model gpt-5.4 --reasoning high` | `story-localization-batch-service.ts` | Add a plan-only wrapper that writes `batches/<run-id>/batch-plan.json` and `input.jsonl` without submission. |
| `stories batch submit --run <run-id>` | existing `stories:batches` submission flow | Wrap existing submit logic and persist run-level audit metadata. |
| `stories batch status --run <run-id>` | existing `stories:batches status` and refresh logic | Present run-level and item-level summary. |
| `stories batch download --run <run-id>` | existing refresh/download logic | Materialize provider files into `batches/<run-id>/`. |
| `stories batch import --run <run-id>` | existing text batch import | Keep `custom_id`-only mapping and idempotent import rules. |
| `stories batch validate --run <run-id>` | `generated-story-validator.ts` and workflow validators | Run deterministic validation after import; never validate raw provider output directly. |
| `stories batch sync --run <run-id>` | wrapper | Refresh, download, import, validate, and summarize. |
| `stories batch retry-plan --run <run-id> --failed-only` | existing retry preparation | Create a new retry plan and input JSONL without reusing successful items. |
| `stories batch todo` | new wrapper over workflow state | Print blocked, retryable, and ready next actions. |

## Image Batch Commands

| Target command | Existing base | Implementation direction |
| --- | --- | --- |
| `stories images batch plan --episodes 025-050 --profile full --model gpt-image-2 --size 1536x864 --quality low` | `images batch prepare` | Add a story-oriented wrapper that groups episodes and writes a run-level plan. |
| `stories images batch plan --episodes 025-050 --profile short --langs en,de,es,fr,pt --model gpt-image-2 --size 864x1536 --quality low` | `images batch prepare` | Reuse current planner, but require profile-specific size validation. |
| `stories images batch submit --run <run-id>` | `images batch submit` | Submit one run at a time and store provider metadata in the run folder. |
| `stories images batch status --run <run-id>` | `images batch status` | Summarize batch and per-asset state. |
| `stories images batch sync --run <run-id>` | `images batch download` + import | Refresh, download, import, validate, and write retry guidance. |
| `stories images batch retry-plan --run <run-id> --failed-only` | `retryFailedImageBatch` | Build a retry JSONL using only retryable failed assets. |
| `stories images batch retry-plan --episode <slug> --profile short --lang de` | new filter wrapper | Derive retry input from stored run/item state and asset manifests. |

## Audio Commands

These should wrap the existing narration pipeline rather than replace it.

- `stories audio generate --episodes 025-050 --langs en,de,es,fr,pt --profiles full,short --reuse-existing`
- `stories audio validate --episodes 025-050 --langs en,de,es,fr,pt --profiles full,short`

Implementation note:

- map `profile full` to narration `variant full`
- map `profile short` to narration `variant short`
- keep generation queue-based and resumable
- block only affected episode/language/profile outputs

## Render Commands

| Target command | Existing base | Implementation direction |
| --- | --- | --- |
| `stories render --episodes 025-050 --langs en,de,es,fr,pt --profiles full,short --reuse-images --reuse-audio --only-ready` | `render <episode-id>` plus validation helpers | Add a multi-target wrapper that skips blocked outputs and continues ready ones. |
| `stories render validate --episodes 025-050 --langs en,de,es,fr,pt --profiles full,short` | render validation helpers | Validate existing outputs only; do not generate missing assets. |
| `stories production repair --episode <slug> --reuse-images --regenerate-audio --render` | existing resume/generate/render pieces | Assemble a targeted recovery command with explicit gates. |

## Production Orchestration Commands

- `stories production next --limit 20`
- `stories production status --episodes 025-050`
- `stories production resume --episodes 025-050`
- `stories production batch --episodes 025-050 --langs en,de,es,fr,pt --profiles full,short --model gpt-5.4 --reasoning high --image-model gpt-image-2 --image-quality low`

`stories production batch` must:

1. plan the next eligible stage only
2. stop on failed validation
3. continue unaffected episodes
4. use imported-and-validated artifacts only
5. delegate audio to `narration-pipeline.ts`
6. delegate rendering to `packages/rendering/src/index.ts`

## CLI Output Shape

Required partial-failure summary pattern:

```text
Image batch completed with failures.

Succeeded: 119
Failed: 1

Blocked:
- 025-the-endless-backrooms / de / short / shot-0007

Unaffected episodes remain ready.

Next:
stories images batch retry-plan --run <run-id> --failed-only
```
