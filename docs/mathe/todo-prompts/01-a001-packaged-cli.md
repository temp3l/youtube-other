Recommended model: GPT-5/Codex  
Recommended reasoning: high

# Implement A-001: packaged CLI and horror compatibility

Implement only A-001 from `docs/mathe/audits/remediation-backlog.md`. Do not begin A-002.

First read `AGENTS.md`, `docs/ai-context/context-pack.md`, the A-001 and F-101 sections of
the remediation backlog and source audit, then inspect the actual package exports, build
outputs, CLI registration, bin entrypoint, Vitest configuration, and relevant package
scripts. Treat source as authoritative. Preserve unrelated dirty changes.

Make plain Node resolve built JavaScript for every workspace package involved in math CLI
startup. Preserve ESM and source types; do not add a runtime TypeScript loader. Restore
root and horror command startup before math dispatch. Prefer lazy math registration only
if it produces an actionable math build error without affecting unrelated commands. Do
not rename commands or change horror defaults.

Add or adjust focused tests for:

- import from a copied or packed workspace;
- root, horror, and math help through the real packaged entrypoint;
- curriculum validate and import dry-run dispatch;
- missing math `dist` behavior if registration is lazy;
- the existing packaged CLI characterization.

Before edits, state the files and reason. Run the directly affected test file first. Batch
compatible packaged help checks into one command where useful. Stay within the repository
test budget; do not run broad build/test/lint/typecheck without explicit authorization.
Do not call providers, render remotely, publish, or use credentials.

After file changes, create
`docs/reports/codex-runs/YYYY-MM-DD-a001-packaged-cli.md` with changed files, checks,
results, remaining risks, and follow-ups. Finish with exact changed paths, commands and
results, commit hash or `not committed`, and a clear A-001 acceptance recommendation.
