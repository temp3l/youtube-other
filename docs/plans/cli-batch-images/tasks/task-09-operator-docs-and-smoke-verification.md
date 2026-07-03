# Task 09 - Operator Docs And Smoke Verification

Recommended model: GPT-5.4-mini for documentation and command examples; GPT-5.4 for final audit consistency review.

Commit after implementation: `docs(image-batch): document CLI batch image workflow`

## Objective

Create final operator/developer documentation and run safe smoke verification for the completed image batch workflow.

## Background

Existing docs cover story-localization batches and endpoint usage, but they do not accurately document the current image batch CLI gap, reference-input limitations, or short image strategy.

## Scope

- Create or update `docs/cli-batch-images.md`.
- Update `docs/plans/cli-batch-images/batch-image-audit.md` with final implementation status.
- Include actual commands, proposed/legacy distinctions, lifecycle states, JSONL examples, manifest examples, output paths, resume/retry behavior, failure recovery, observability, and known limitations.
- Include a Mermaid flowchart.
- Verify referenced paths and commands.

## Out of scope

- No production code changes unless a docs verification issue exposes a typo in command registration already implemented by prior tasks.
- No real provider calls.

## Dependencies

Tasks 01-08.

## Repository evidence

- `docs/batch-cli.md`
- `docs/openai-api-endpoint-audit.md`
- `docs/development/commands.md`
- `apps/cli/src/index.ts`
- `packages/image-generation/src/image-batch-service.ts`

## Required changes

- Document actual implemented image batch commands.
- Clearly label any remaining proposed interfaces as not implemented.
- Document full-versus-short image strategy as implemented.
- Document reference-image handling and staged-batch requirements.

## Data model or manifest changes

No schema changes. Include sanitized examples from the implemented manifest and request formats.

## CLI behavior

Document:

```bash
pnpm mediaforge -- images batch prepare --episode <episode> --languages en --variants full
pnpm mediaforge -- images batch submit --episode <episode> --batch <local-id>
pnpm mediaforge -- images batch status --episode <episode> --batch <local-id>
pnpm mediaforge -- images batch download --episode <episode> --batch <local-id>
pnpm mediaforge -- images batch resume --episode <episode>
```

Adjust examples to match the exact merged CLI.

## Error handling and observability

Document invalid JSONL, validation failure, expired batch, partial errors, missing files, unknown/duplicate custom IDs, invalid base64, unsupported endpoint, missing reference image, destination conflict, manifest/filesystem disagreement, and renderer resolution failure.

## Security and cost controls

Document prepare-only mode, request count preview, model/size/quality preview, confirmation behavior if implemented, duplicate-submission prevention, logging without secrets, and avoiding unnecessary short generation.

## Tests

- Markdown formatting check.
- Mermaid diagram check if tooling is available.
- Focused CLI registration tests.
- Focused image batch tests.

## Verification commands

```bash
pnpm test:focused -- apps/cli/src/index.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm docs:diagrams:check
pnpm exec prettier --check docs/cli-batch-images.md docs/plans/cli-batch-images
```

## Acceptance criteria

- Documentation matches implemented commands and behavior.
- Known limitations are explicit.
- Smoke verification is recorded in the final task commit.

## Rollback considerations

Docs-only rollback is safe. Do not roll back earlier implementation commits unless their behavior is also reverted.
