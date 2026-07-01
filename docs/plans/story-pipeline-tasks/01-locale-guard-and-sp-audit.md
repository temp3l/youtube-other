# Task 01: Locale Guard And `sp` Audit

## 1. Role And Context

You are implementing the first compatibility task for the multilingual story workflow. This task is narrow: canonical locales are exactly `en`, `de`, `fr`, `es`, and `pt`; `sp` must not create a second Spanish branch.

## 2. Required Repository Instructions

Read root `AGENTS.md` and `packages/story-localization/AGENTS.md`. Use focused searches. Do not make paid provider calls. Do not change unrelated behavior.

## 3. Objective

Add or tighten locale normalization/audit behavior so CLI input, workflow-facing schemas, cache/batch manifests, and artifact path planning reject `sp` or migrate it to `es` only through an explicit compatibility migration path.

## 4. Prerequisite Tasks

None.

## 5. Authoritative Planning References

- Master plan: "Locale And `sp` Findings", "Target Requirements".
- Repository map: "Locale And `sp` Findings".
- Schema design: "Runtime Validation".

## 6. Architectural Invariants

- Canonical locale identity is `en,de,fr,es,pt`.
- Spanish is `es`; `sp` is legacy/accidental.
- No artifact path, cache key, batch item, or workflow stage may use `sp`.

## 7. Exact Scope

Modify only locale normalization and tests. Do not implement the workflow engine.

## 8. Likely Files And Symbols

- `packages/shared/src/episode-filesystem.ts`: `localeCodes`, `normalizeLocaleCode`.
- `packages/story-localization/src/story-localization.types.ts`: `languageCodes`.
- `packages/story-localization/src/language-profiles.ts`: `LANGUAGE_PROFILES`.
- CLI parsers in `apps/cli/src/story-full-rewrite-command.ts`, `story-short-rewrite-command.ts`, `story-localization-commands.ts`.

## 9. Required Implementation Behavior

- Reject `sp` in normal CLI and schema paths with an error mentioning `es`.
- If a migration helper is added, it must be opt-in and return a warning.
- Add search/audit test coverage for exact locale tokens.

## 10. Required Types

Use existing `LanguageCode` and `LocaleCode`; add a small parse result union only if needed.

## 11. Required State Transitions

Invalid `sp` input transitions to validation error before stage creation.

## 12. Required Failure And Fallback Behavior

No fallback. `sp` is not a valid locale.

## 13. Persistence Requirements

No persisted workflow state in this task. Tests may use temp fixtures.

## 14. Observability Requirements

Error messages must be actionable and mention `es`.

## 15. Backward-Compatibility Requirements

Do not break valid regional tags such as `es-419` where current code accepts primary locale extraction.

## 16. Tests And Fixtures

Add tests for `sp`, `sp-SP`, `es`, `es-419`, duplicate `es,sp`, and persisted fixture audit if helper exists.

## 17. Explicit Non-Goals

No workflow manifest, fallback, batch, or media implementation.

## 18. Parallelization Constraints

Can run before all other tasks. Avoid editing future workflow files.

## 19. Commands To Run

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- apps/cli/src/story-short-rewrite-command.unit.test.ts
pnpm test:focused -- apps/cli/src/story-full-rewrite-command.unit.test.ts
```

## 20. Acceptance Criteria

`sp` cannot be accepted as locale identity and cannot create an artifact branch.

## 21. Requested Commit Message

`fix(locale): reject legacy sp story locale`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.4 Medium, medium reasoning.
