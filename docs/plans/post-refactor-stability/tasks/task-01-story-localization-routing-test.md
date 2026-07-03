# Task 01 - Story-Localization Routing Test

## Metadata

Task ID: Task 01  
Finding references: F2  
Severity: high  
Dependencies: none  
Can run in parallel with: Task 02, Task 03, Task 04  
Must not run concurrently with: other edits to `packages/story-localization/src/story-localization.unit.test.ts` or full/short repair routing code  
Likely affected packages: `@mediaforge/story-localization`  
Likely affected files: `packages/story-localization/src/story-localization.unit.test.ts`, possibly `packages/story-localization/src/story-localization.service.ts`, `packages/story-localization/src/generated-story-validator.ts`, `packages/story-localization/src/story-retry-routing.ts`  
Estimated risk: medium  
Paid calls allowed: No

## Context

The focused test `rejects localized full outputs that would require short-specific repair` in `packages/story-localization/src/story-localization.unit.test.ts` currently fails at line 549. The assertion expects `result.failure` to contain `Short word count`, but current validation returns `Character names are missing.` first.

The invariant is broader than the first validation message:

```text
A localized full-story validation failure must not invoke short-story repair behavior.
```

Relevant symbols:

- `makeLocalizedPackage` in `packages/story-localization/src/story-localization.unit.test.ts`.
- `localizeStoryEpisode` in `packages/story-localization/src/story-localization.service.ts`.
- `hasShortLengthIssue`, `filterEnglishFullValidationIssues`, and full repair request labels in `story-localization.service.ts`.
- `validateGeneratedStoryPackage` and short validation messages in `packages/story-localization/src/generated-story-validator.ts`.
- `story-request-telemetry.ts` repair stage labels `full-repair` and `short-repair`.

Repository-specific instructions also apply from `packages/story-localization/AGENTS.md`: use focused tests, mock provider calls, and do not regenerate fixtures automatically.

## Problem Statement

The current regression test can fail for validator ordering or fixture reasons without proving the routing invariant. A localized full output with validation issues must use full repair/regeneration behavior and must not invoke short-specific repair prompts, labels, telemetry, retry routing, or output writes.

## Goals

- Preserve and pin the invariant that localized full validation failures do not invoke short repair behavior.
- Make the failing test resilient to unrelated validation issue ordering.
- Ensure the fixture failure is intentional and not masked by unrelated validation defects.
- Prove short repair routing is not used.
- Keep tests zero-cost with mocked clients only.

## Non-Goals

- Do not weaken full or short validation rules.
- Do not change production routing only to satisfy an old message expectation.
- Do not regenerate story fixtures.
- Do not make live OpenAI calls.
- Do not change short rewrite behavior except as needed to preserve the localized full invariant.

## Required Implementation Analysis

Before editing:

- Read `packages/story-localization/AGENTS.md`.
- Inspect `makeLocalizedPackage` and the failing test in `packages/story-localization/src/story-localization.unit.test.ts`.
- Inspect full repair and second-repair behavior in `packages/story-localization/src/story-localization.service.ts`.
- Inspect validator issue ordering and issue text in `packages/story-localization/src/generated-story-validator.ts`.
- Inspect `story-retry-routing.ts` and `story-request-telemetry.ts` only if routing code is touched.
- Run the exact failing focused test once to confirm the current failure.

## Implementation Steps

1. Adjust the failing test so it asserts the intended invariant rather than the first validation message.
2. If fixture data is the issue, change only the test fixture data needed to make the intended full-vs-short scenario unambiguous.
3. Assert that full repair routing is used when localized full validation fails and retry is allowed.
4. Assert that short repair routing is not used, including absence of request labels or prompt content such as `short repair` for this localized full flow.
5. Assert that no `es/short/script.md` or equivalent short output is written by the localized full scenario.
6. Ensure unrelated validation failures do not mask the intended fixture behavior. Prefer checking the set of issues or request labels over relying on issue order.
7. Keep provider calls mocked through existing test helpers.

## Type-Safety Requirements

- Do not introduce unnecessary `any`.
- Do not add unsafe casts unless the test helper already requires a narrow cast and the reason is local and clear.
- Preserve readonly fixture shapes where practical.
- Prefer existing schema-derived types such as `GeneratedStoryPackage`.
- Use explicit route labels or typed telemetry fields where existing types expose them.

## Observability Requirements

If production logging is touched, preserve or add structured fields only where appropriate:

- `episodeSlug`
- `language`
- `variant`
- `contentHash`
- `validationCode`

Do not log authored scripts, full generated story text, provider secrets, or large payloads.

## Security And Path-Safety Requirements

This task is expected to be test-focused. If file assertions are changed:

- Use temporary directories.
- Do not write outside the test temp root.
- Do not delete or overwrite repository-authored content.

## Tests

Update or add tests proving:

- Localized full repair/regeneration routing is used for localized full validation failure.
- Short repair routing is not used for localized full validation failure.
- The fixture failure is not masked by unrelated character-name or preservation failures.
- Assertions do not depend on validator issue order unless ordering is the behavior being tested.
- No short artifact is written by the localized full scenario.

Existing tests to run:

- `packages/story-localization/src/story-localization.unit.test.ts`
- Consider `packages/story-localization/src/story-retry-routing.unit.test.ts` only if retry routing code changes.

## Validation Commands

```bash
pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts -t "rejects localized full outputs that would require short-specific repair"
pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts
pnpm --filter @mediaforge/story-localization typecheck
```

## Acceptance Criteria

- [ ] The focused failing test passes without relying on a first-error message of `Short word count`.
- [ ] The test proves full repair or full regeneration routing was used.
- [ ] The test proves short repair routing was not used.
- [ ] The test proves unrelated validation failures do not mask the intended scenario.
- [ ] No paid provider calls are made.
- [ ] `@mediaforge/story-localization` typecheck passes if production code changes.

## Stop Conditions

Stop and report if:

- Fixing the task requires unrelated architecture changes.
- The fixture appears stale in more than three unrelated places.
- Assertions would need to be weakened to pass.
- A paid provider call becomes necessary.
- Existing behavior contradicts the audit materially.
- Broad generated-file churn appears.
- Validation would require deleting or overwriting authored content.

## Commit Guidance

Suggested message:

```text
test(story-localization): restore full repair routing coverage
```

Include only the routing test changes and any minimal production change required to preserve the invariant. Do not include unrelated fixture regeneration or broad validation changes.
