# Task 10: Visual Branch Boundary

## 1. Role And Context

You are defining when shared images can start.

## 2. Required Repository Instructions

Read media architecture docs only as needed; use image package tests.

## 3. Objective

Add workflow stages for language-neutral visual preparation and shared image dependency checks, starting after accepted English full and English quality pass.

## 4. Prerequisite Tasks

Tasks 06 and 07.

## 5. Authoritative Planning References

- Master plan "Image-Generation Dependency".
- Existing Task 14 plan.

## 6. Architectural Invariants

Localized branch failures must not block shared image generation.

## 7. Exact Scope

Schedule/check visual stages; do not rewrite image generation internals.

## 8. Likely Files And Symbols

- `episode-image-pipeline.ts`.
- `image-batch-planner.ts`.
- `images-resume-command.ts` only if status adapter needed.

## 9. Required Implementation Behavior

Require accepted canonical English full, production gate pass, scene/visual prep success. Mark images blocked only by English/visual failures.

## 10. Required Types

Visual stage artifact references and dependency fingerprints.

## 11. Required State Transitions

English accepted -> visual model -> scenes -> image prompts -> images.

## 12. Required Failure And Fallback Behavior

Image generation failures block dependent renders, not stories/locales.

## 13. Persistence Requirements

Workflow links existing image manifests and prompt paths.

## 14. Observability Requirements

Report sharedImages status separately.

## 15. Backward-Compatibility Requirements

Keep existing image state directories.

## 16. Tests And Fixtures

English accepted images start; English rejected images blocked; German failure does not block images.

## 17. Explicit Non-Goals

No localized thumbnails or renders.

## 18. Parallelization Constraints

Parallel with locale/short tasks after quality adapter.

## 19. Commands To Run

```bash
pnpm test:focused -- packages/image-generation/src/episode-image-pipeline.unit.test.ts
pnpm test:focused -- packages/story-localization/src/story-workflow-visual.unit.test.ts
```

## 20. Acceptance Criteria

Shared image branch has the safest dependency boundary and locale isolation.

## 21. Requested Commit Message

`feat(workflow): schedule shared images from accepted English`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.5 Medium, medium reasoning.
