# History V3.3 remediation

Summary: added canonical UTF-16 narration, aggregate long-form timing, strict
OpenAI claim/evidence/visual adapters, real-source retrieval, deterministic
provenance, fail-closed visual planning, full approval exporters, explicit CLI
phases, regenerated packs, and a final acceptance audit.

Changed paths: `packages/history/src/*v33*`, `packages/history/src/index.ts`;
`apps/cli/src/history-commands*`, `apps/cli/src/index.ts`;
`docs/history/overview.md`, `docs/history-v3.3/*`; three episode
`source/history-v3.3/` trees; ignored `artifacts/chatgpt-review/history-approval-packs-v3.3*`.

Tests: V3.2 2/2, V3.3 23/23, CLI 11/11; History typecheck/build, targeted
ESLint, JSON/reference/checksum/security/ZIP audit passed. Two Phase B runs
matched; combined SHA-256 `6c402f1c…ed57c`.

Commit: `b052575d915ef80a578d99521c9b26ffeaaaeb6f` (worktree changes uncommitted).

Risks: 296 material claims remain blocked; timing is provisional; maps/diagrams
are withheld. Retrieved sources/fragments: Napoleon 1, Rome 3, Black Death 1.
Britannica returned 403 and Nature redirected to authentication. Live OpenAI
calls completed: 0; escalation was rejected because usage quota is exhausted
until 2026-08-12 23:01.
