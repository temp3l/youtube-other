# Baseline Stabilization: F48

## Changed files

- `packages/story-localization/src/story-localization.unit.test.ts`
- `docs/refactor/audit/README.md`

## Tests/checks run

- `pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts -t "keeps sibling locales valid when one localized full fails validation"`
  (three bounded diagnostic attempts, then one fresh-context verification)

## Results

- Classified F48 as a stale fixture after the focused file passed F42-F47.
- Updated its response sequence to the current v4 full-story contract: English
  prerequisite, valid German sibling, then deliberately invalid Spanish.
- Disabled Short generation because the test concerns full-story locale isolation.
- The final bounded diagnostic exposed the remaining fixture mismatch: German
  produced 990 words against this workflow's canonical 1045-word floor.
- Padding German to that canonical floor clears F48: the German full script is
  written while the invalid Spanish sibling remains isolated.

## Risks remaining

- F49 remains unverified.

## Follow-up tasks

- Reconcile F49, then run the complete file and Batch 1 acceptance checks.
