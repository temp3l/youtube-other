# CLI And Application Orchestration

## Current wrappers

- `mediaforge create/run/status/inspect/retry`: legacy `@mediaforge/pipeline` application.
- `mediaforge episode ...`: active but coupled to `@mediaforge/dark-truth` direct functions.
- `mediaforge stories ...`: active story-localization commands.
- `mediaforge audio generate/generate-localized`: mixed legacy and staged narration routing.
- `mediaforge audio narration ...`: staged narration use case.
- `mediaforge images ...`: direct image utilities, some canonical and some bypasses.
- `mediaforge render ...`: direct renderer.
- `mediaforge metadata youtube`, `youtube upload`: active downstream commands.

## Obsolete assumptions

- English full defaults to root `script.md` in some flows.
- `short-rewrite.resolution.ts` searches root, `en/full`, and `en/script`.
- Story analysis reads `<language>/full/script.md`.
- Localized audio helpers build `audio`, `segments`, and metadata paths ad hoc.
- `episode` commands call `buildEpisodeLoadResult`, `generateCanonicalImages`, and `renderCleanVideo` directly.

## Bypass classification

| Direct call | Classification | Target |
|---|---|---|
| CLI -> `@mediaforge/pipeline` | LEGACY_BYPASS | remove after replacement |
| CLI -> `@mediaforge/dark-truth` functions | ARCHITECTURAL_VIOLATION | wrap as typed use cases then collapse |
| CLI -> image plan/generate services | VALID_APPLICATION_USAGE if resolver-backed | keep as use case |
| CLI -> raw OpenAI image helper | UNCERTAIN | investigate/remove or mark advanced |
| Tests importing low-level helpers | TEST_ONLY | keep only if testing package behavior |

## Target boundary

```text
CLI / API / worker
-> typed application command
-> central script resolver
-> pipeline orchestration
-> domain and infrastructure services
```

## Target flags

All active commands that operate on scripts should accept:

- `--episode <slug>`
- `--language <code>`
- `--variant <full|short>`

An advanced `--script <path>` override may remain only for explicit import/evaluation tools. It must be contained, validated, logged as noncanonical, and excluded from normal production docs.
