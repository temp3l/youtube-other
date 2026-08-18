# Veronica render-manifest identity closure

## Summary

The corrected canonical resolver suite passes 7/7 without implementation changes.
Veronica render manifests now use `veronica-render-manifest.v2` and directly embed
an immutable canonical pack/story/series-episode/locale/variant/narration-hash
identity. Creation, input fingerprints, resume, compilation, output validation,
approval-pack integrity, render derivatives, and CLI render loading fail closed on
missing or mismatched identity. Paid provider calls: 0.

## Changed files

- `packages/domain/src/veronica-content-source.ts`
- `packages/strategic-reinvention/src/{veronica-content-pack-2-ingestion,supplemental-media-bridge,episode-pipeline}.ts`
- `packages/veronica-media/src/contracts/media-plan.v1.ts`
- `packages/veronica-media/src/{pipeline,rendering,review-pack}/**` (targeted manifest lifecycle code and tests)
- `packages/veronica-media/src/{fixtures,delivery}/**` (targeted fixtures/tests)
- `apps/cli/src/veronica-media-commands.ts`
- `docs/{veronica-content-source-of-truth.md,architecture/veronica-source-pack-ingestion.md,architecture/veronica-supplemental-media/overview.md}`
- This report.

## Tests/checks run and results

- Resolver focused suite: PASS, 7/7.
- Five focused manifest/consumer unit files: PASS, 11/11.
- Pipeline create/resume integration: PASS, 2/2 using normal `/tmp` after space was freed.
- Domain, Veronica media, strategic-reinvention, and CLI typechecks: PASS.
- Targeted ESLint and `git diff --check`: PASS.
- Targeted domain and Veronica-media builds refreshed local declarations: PASS.

## Risks and follow-up

Existing v1 render manifests intentionally fail closed and require regeneration.
No broad suite, FFmpeg render, multilingual remediation, or provider-backed check was run.
