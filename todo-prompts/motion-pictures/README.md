# FFmpeg Motion Presets — Implementation Batch Prompts

Use these Codex prompts in order. The conservative path is recommended for a production renderer.

## Recommended Order

1. `01-characterization-tests.md`
2. `02-domain-foundation-types-config-registry.md`
3. `03-selection-and-filter-builder.md`
4. Review the diff before renderer integration.
5. `04-renderer-integration.md`
6. Review render/cache/fingerprint changes.
7. `05-cli-and-manifest-integration.md`
8. `06-debug-reporting.md`
9. `07-smoke-tests-and-docs.md`

## Optional Faster Path

Use `optional-01-to-05-single-session.md` only if you want to run Tasks 01–05 in one Codex session before touching renderer integration. Do not continue into Task 06 in that same session.

## Do Not Parallelize

- Task 06 with Task 07.
- Task 06 with Task 08.
- Task 05 with Task 06.
- Any tasks editing the same renderer entry points.

## Model Recommendations

| Prompt | Model |
|---|---|
| `01-characterization-tests.md` | GPT-5.5 High |
| `02-domain-foundation-types-config-registry.md` | GPT-5.5 Medium/High |
| `03-selection-and-filter-builder.md` | GPT-5.5 High |
| `04-renderer-integration.md` | GPT-5.5 High only |
| `05-cli-and-manifest-integration.md` | GPT-5.5 High |
| `06-debug-reporting.md` | GPT-5.5 Medium/High |
| `07-smoke-tests-and-docs.md` | GPT-5.5 Medium |
| `optional-01-to-05-single-session.md` | GPT-5.5 High only |
