# Horror Rollout Control And Characterization

Date: 2026-07-24

## Changed Files

- `packages/story-localization/src/{story-localization.types,story-prompt-compiler,story-prompt-compiler.unit.test,story-localization.service,story-localization-batch-service}.ts`
- `packages/config/src/{index,index.unit.test}.ts`
- `apps/cli/src/{story-full-rewrite-command,story-full-rewrite-command.unit.test,story-localization-commands,story-localization-commands.unit.test}.ts`
- `docs/{architecture/story-localization,development/configuration,cli}.md`
- Required implementation and run reports.

## Tests And Checks

- Temporary characterization outside configured test roots: no tests found; moved into the affected compiler test.
- Compiler characterization filter: 1 passed and captured the enforced prompt/system/user/plan hashes.
- Initial focused run: 36 passed, 1 CLI plumbing assertion failed because the source command resolved the built package factory; the test now mocks that boundary.
- `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 packages/story-localization/src/story-prompt-compiler.unit.test.ts packages/config/src/index.unit.test.ts apps/cli/src/story-localization-commands.unit.test.ts apps/cli/src/story-full-rewrite-command.unit.test.ts`: 40 passed.
- `pnpm --filter @mediaforge/story-localization typecheck`: passed.
- Targeted `git diff --check`: passed.

## Results

`MEDIAFORGE_HORROR_AFFECT_ROLLOUT_MODE` accepts exactly `off`, `shadow`, or
`enforce` and defaults to `shadow`. Off skips plan construction. Shadow builds
and validates the deterministic plan while matching off request text and prompt
fingerprint. Enforce preserves the characterized prompt and fingerprint. Sync
and batch canonical-English callers receive the same typed setting; localized
full and Short behavior is unchanged.

## Risks And Follow-Up

Shadow diagnostics are compiler-visible but are not persisted yet. Stop after
Task 01; persistence belongs to Task 02.

## Commit

`28091ea` (changes uncommitted).
