# Task: Repository Analysis And Baseline

You are auditing the existing production repository. Do not implement the refactor in this prompt.

## Objective

Produce a repository-grounded baseline for full-story and short-story generation, localization, validation, repair, downstream media stages, persistence, resume, cost, telemetry, and CLI commands.

## Required Inspection

Inspect at least:

- `apps/cli/src/story-localization-commands.ts`
- `apps/cli/src/story-full-rewrite-command.ts`
- `apps/cli/src/story-short-rewrite-command.ts`
- `apps/cli/src/index.ts`
- `packages/story-localization/src`
- `packages/shared/src/episode-filesystem.ts`
- `packages/config/src/index.ts`
- `packages/metadata/src`
- `packages/scene-planning/src`
- `packages/image-generation/src`
- `packages/youtube-upload/src`

Do not use `docs.bak` as architecture guidance. Treat source and tests as authoritative.

## Required Findings

Document:

- all commands that can produce `en/full`, `en/short`, `es/full`, `es/short`, `de/full`, `de/short`, `pt/full`, and `pt/short`;
- whether `fr/full` and `fr/short` remain supported;
- exact locale variants used by code, including Portuguese;
- full-story call graph from CLI to provider request;
- short-story call graph from CLI to provider request;
- whether shorts derive from raw source, English full, localized full, or another localization;
- where schemas, prompt builders, validators, repair logic, retry logic, cache keys, manifests, costs, and telemetry live;
- downstream metadata, audio, TTS, scene, image, render, thumbnail, and upload commands;
- missing files or broken runtime assumptions, including absent prompt templates.

## Baseline Report

Create or update a repository analysis document under this task pack. Include a table with:

| Stage | Current command/function | Source artifact | Output artifact | Model/config | Validation | Cache/resume | Known defect |
|---|---|---|---|---|---|---|---|

## Acceptance Criteria

- No production refactor is implemented.
- The report names actual files, functions, commands, languages, and locales.
- Full and short call graphs are separate.
- Current lineage defects are explicit.
- Later prompts can rely on the report without guessing paths or command names.
