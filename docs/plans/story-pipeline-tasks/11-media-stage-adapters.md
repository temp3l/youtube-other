# Task 11: Media Stage Adapters

## 1. Role And Context

You are connecting accepted story artifacts to downstream media owners.

## 2. Required Repository Instructions

Do not refactor media internals. Add adapters and tests.

## 3. Objective

Create workflow adapters for audio, captions, metadata, thumbnails, render, and publish with isolated failure behavior.

## 4. Prerequisite Tasks

Tasks 08, 09, and 10.

## 5. Authoritative Planning References

- Master plan "Full And Short Independence", "Render Dependencies".
- Repository map media rows.

## 6. Architectural Invariants

Rendering depends only on accepted required inputs; media failures do not invalidate stories.

## 7. Exact Scope

Workflow scheduling/adapters and tests. Avoid changing package-owned schemas unless additively needed.

## 8. Likely Files And Symbols

- `packages/speech/src/index.ts`.
- `packages/metadata/src/youtube-metadata.ts`.
- `packages/image-generation/src/story-thumbnail.ts`.
- `packages/rendering/src/index.ts`.
- `packages/youtube-upload/src/index.ts`.

## 9. Required Implementation Behavior

For each accepted locale/format story, schedule audio, metadata, thumbnail, render, publish according to dependencies; isolate failures.

## 10. Required Types

Media artifact lineage and stage outcomes.

## 11. Required State Transitions

story accepted -> audio/metadata/thumbnail -> render -> publish; missing dependency -> blocked.

## 12. Required Failure And Fallback Behavior

Audio failure blocks render only where audio is required. Metadata failure blocks publish only. Render failure blocks publish only.

## 13. Persistence Requirements

Store references to package-owned manifests, not duplicated payloads.

## 14. Observability Requirements

Record provider/model/cost/duration for each media stage where available.

## 15. Backward-Compatibility Requirements

Existing media commands and paths remain valid.

## 16. Tests And Fixtures

Audio partial failure; metadata partial failure; render blocked by missing audio; publish blocked by missing metadata/thumbnail.

## 17. Explicit Non-Goals

No provider batch integration for metadata/TTS.

## 18. Parallelization Constraints

Coordinate with status/report task.

## 19. Commands To Run

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow-media.unit.test.ts
pnpm test:focused -- packages/rendering/src/index.unit.test.ts
```

## 20. Acceptance Criteria

Media failures are isolated and dependencies explicit.

## 21. Requested Commit Message

`feat(workflow): add media stage adapters`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.5 Medium, medium reasoning.
