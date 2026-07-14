# Baseline Stabilization: Resume and Math Fixtures

## Summary

Continued Batch 1 with F06-F08. The image-resume unit boundary now models a
passing script-score gate and verifies the exact episode, locale, and format
request, preserving the production gate. The current math command fixture
already passes its v3 lineage contract. No production behavior changed.

## Changed files

- `apps/cli/src/images-resume-command.unit.test.ts`
- `docs/refactor/audit/README.md`
- This report.

## Tests/checks run and results

- Image-resume unit file: initially failed at F06, then passed 5/5.
- Math-commands unit file: passed 10/10, including F08.
- Targeted ESLint for the changed test file: passed.
- Targeted `git diff --check`: passed.

## Risks and follow-up

Batch 1 remains `IN_PROGRESS`; no broad baseline was run. F09 is the next
bounded stale-fixture repair: its 8x8 shared-sync image conflicts with the
accepted 1536x1024 full-image contract. Batch 2 remains blocked.
