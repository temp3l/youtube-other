# CLI typecheck restoration

Summary: Restored `apps/cli` from 12 diagnostics to zero. Exact-optional migration inputs now omit absent fields, image commands parse branded scene IDs and conditionally forward optional QA dependencies, and metadata builders always supply required budget fields. Existing image-resume fixtures now include a valid review pack, preserving fail-closed approval behavior.

Changed: `apps/cli/src/{episode-layout-migration-command.ts,images-resume-command.ts,images-resume-command.unit.test.ts,index.ts,veronica-media-commands.ts}`.

Checks: 14 targeted CLI tests passed; `pnpm --filter ./apps/cli typecheck` and `build` passed; targeted ESLint, unsafe-suppression search, and diff check passed. Packaged CLI accepted `-L` after the build; `dist/` is ignored.

Commit: `861a634` (superseded by the report-only amendment below).

Risks: No provider calls or destructive migrations. No remaining CLI type diagnostics.
