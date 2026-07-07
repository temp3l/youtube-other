# AI Context Pack Report

- Date: 2026-07-07.
- Original request: create a compact, accurate AI context pack for safe future Codex prompts.
- Inspected: git status/diff/stat/log, `AGENTS.md`, workspace/config/test files, CLI registration, package surfaces, source paths, plans/audits/reports, scripts, dirty changed areas, episode path examples.
- Files created/updated: `docs/ai-context/00-project-overview.md`, `01-architecture.md`, `02-domain-model.md`, `03-cli-workflows.md`, `04-pipeline-map.md`, `05-important-paths.md`, `06-testing-and-verification.md`, `07-known-risks-and-open-tasks.md`, `08-codex-prompting-rules.md`, `context-pack.md`, `docs/reports/codex-runs/2026-07-07-ai-context-pack.md`, `AGENTS.md`.
- Important findings: dirty tree contains recent story workflow, image batch, render-motion, docs, and report changes; story pipeline CLI remains dry-run skeleton; provider edit-batch support is blocked; episode validation artifacts are stale.
- Stability assessment: source-level stabilization is improving, but release readiness is partial.
- Gaps/unknowns: paid provider behavior, stale episode fixture reconciliation, built `dist` freshness.
- Risks remaining: uncommitted changes, stale audits, invalid repository artifacts, broad verification not run.
- Verification run: `git diff --check -- AGENTS.md docs/ai-context docs/reports/codex-runs/2026-07-07-ai-context-pack.md` passed.
- Commands intentionally not run: broad tests/build/lint/typecheck, provider calls, remote render, upload.
- Recommended next Codex prompt: reconcile and verify episode `022-the-whistler-in-the-woods` validation artifacts with no paid calls.
