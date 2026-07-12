# Short Metadata And Visual Validation Compat

Summary: Fixed upload-time metadata generation so requested Short uploads build variant-specific metadata from variant-specific scene inputs and write to `locales/<lang>/short/metadata`. Episode validation now accepts legacy visual-retention artifacts that omit `validationCode` and shot-plan `sourceIdentity` when references still validate. Commit: `9ad3882`.

Changed paths: `packages/youtube-upload/src/index.ts`, `packages/youtube-upload/src/index.unit.test.ts`, `apps/cli/src/index.ts`, `apps/cli/src/episode-commands.ts`, `apps/cli/src/episode-commands.unit.test.ts`.

Tests/checks: `pnpm test:focused -- packages/youtube-upload/src/index.unit.test.ts`; `pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts`; `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 apps/cli/src/episode-commands.unit.test.ts -t "accepts legacy visual-retention artifacts that omit source identity and validationCode"`.

Results: upload-package test passed; targeted legacy visual-retention compatibility test passed; broad `episode-commands.unit.test.ts` still has one unrelated pre-existing failure in `synthesizes a shared character registry when the source pack omits characters.json`.

Risks remaining: CLI upload metadata generation still relies on legacy `language/variant/scenes.json` compatibility paths before canonical resolver-backed metadata scene ownership exists.

Follow-up tasks: move variant-specific metadata scene resolution behind shared resolver APIs; investigate the unrelated character-registry test failure separately.
