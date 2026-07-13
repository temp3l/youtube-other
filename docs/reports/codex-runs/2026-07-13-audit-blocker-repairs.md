# Audit blocker repairs

Date: 2026-07-13

## Changed files

- `packages/educational-renderer/`: containment, cache promotion, overwrite/CLI/public-error contracts,
  packed acceptance, dependency enforcement, tests, and docs.
- `pnpm-lock.yaml`: renderer importer only.
- Required implementation report and this report.

## Checks

- Security: 42 passed.
- CLI/API/boundary: 32 passed.
- Packed consumer/real integration: 9 passed.
- Build, typecheck, lint, frozen offline install, isolated preview, and FFprobe: passed.
- Mediaforge startup: exit 1 on unrelated `.ts` runtime import.

## Risks and follow-up

Local verification evidence was preserved while 78 generated files were untracked. Portable Node lacks
`openat2`, leaving the documented hostile same-user rename race assumption. Independent security review is
required before the release, visual-correctness, and operational-completeness plans.
