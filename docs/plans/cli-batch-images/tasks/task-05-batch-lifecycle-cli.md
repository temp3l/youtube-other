# Task 05 - Batch Lifecycle CLI

Recommended model: GPT-5.4-mini for CLI wiring; GPT-5.4 for reviewing lifecycle semantics and operator safety.

Commit after implementation: `feat(cli): expose image batch lifecycle commands`

## Objective

Expose image batch preparation, submission, status, download, and resume through a clear CLI workflow.

## Background

`submitImageBatch`, `refreshImageBatch`, `importImageBatch`, and `retryFailedImageBatch` exist but are not registered under the `images` CLI command group.

## Scope

- Add `images batch prepare`.
- Add `images batch submit`.
- Add `images batch status`.
- Add `images batch download`.
- Add `images batch resume`.
- Print machine-readable JSON with `--json`.
- Reuse existing runtime config and workspace resolution conventions.

## Out of scope

- No new paid behavior without explicit submit command.
- No broad episode orchestration rewrite.
- No legacy workbook command changes.

## Dependencies

Tasks 02-04.

## Repository evidence

- `apps/cli/src/index.ts`
- `apps/cli/src/images-resume-command.ts`
- `apps/cli/src/story-localization-commands.ts`
- `packages/image-generation/src/image-batch-service.ts`

## Required changes

- Create a focused CLI module for `images batch`.
- Wire command registration from `apps/cli/src/index.ts`.
- Require explicit `submit` before network calls.
- Resolve batch references by local or OpenAI batch ID.

## Data model or manifest changes

None beyond previous tasks.

## CLI behavior

Proposed commands:

```bash
pnpm mediaforge -- images batch prepare --episode <episode> --languages en,de --variants full,short
pnpm mediaforge -- images batch submit --episode <episode> --batch <local-id>
pnpm mediaforge -- images batch status --episode <episode> --batch <local-id>
pnpm mediaforge -- images batch download --episode <episode> --batch <local-id>
pnpm mediaforge -- images batch resume --episode <episode>
```

Use repository naming conventions if command registration requires slight adjustment.

## Error handling and observability

CLI output must include episode, language, variant, local batch ID, OpenAI batch ID when present, endpoint, item counts, retryable failures, and cost-relevant request settings. Do not print secrets or signed URLs.

## Security and cost controls

Only `submit` may upload files or create remote batches. `prepare` must be local-only and print a request summary.

## Tests

- Command registration.
- Prepare command calls planner without provider client.
- Submit command calls upload/create only for prepared manifests.
- Status/download/resume command routing with fake clients.

## Verification commands

```bash
pnpm test:focused -- apps/cli/src/index.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
```

## Acceptance criteria

- Operators can run image batch lifecycle commands from CLI.
- No command submits paid work except `submit`.
- JSON output is stable enough for automation.

## Rollback considerations

Commands are additive. Rollback by removing the registration module and tests.
