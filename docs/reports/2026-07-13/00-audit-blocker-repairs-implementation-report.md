# Batch 0 audit blocker repairs — implementation report

- Source plan: `docs/plans/linux-math-renderer/00-audit-blocker-repairs.md`
- Date: 2026-07-13

## Result and changed files

Tasks 1–6 completed. Source/CLI, tests, scripts, docs, ignore rules, and lockfile importer changed.
Seventy-eight tracked artifacts were untracked but remain locally.
Task 7 plans remain pending.

## Checks

- Filesystem security: exit 0, 42 tests. Output/cache root, prefix, entry, transaction, target, dangling,
  in-root, and concurrent replacement attacks returned `FILESYSTEM_BOUNDARY_VIOLATION`; sentinels stayed
  byte-identical. Safe hard-link and copy fallback passed.
- CLI/API/boundary: exit 0, 32 tests. Invalid formula/profile exits, overwrite refusal, sanitized unknown
  errors, and disposable bidirectional dependency mutations passed.
- Packed consumer plus real integration: exit 0, 9 tests after one declaration-leak repair. Build,
  typecheck, lint, frozen offline install, and scoped diff checks: exit 0.
- Isolated preview: exit 0. FFprobe: 38s H.264 960×540 yuv420p/15fps, AAC, mov_text subtitles.
- Mediaforge startup classification: exit 1, pre-existing TypeScript source import from packaged CLI.

## Deviations, risks, next steps

A first preview confirmed input containment; its contained rerun passed.
Node lacks portable `openat2`; hostile same-user directory-renaming remains documented. Obtain an independent
security audit, then execute Task 7 plans in order. Global diff-check remains blocked by unrelated Markdown
hard-breaks. No commit was created.
