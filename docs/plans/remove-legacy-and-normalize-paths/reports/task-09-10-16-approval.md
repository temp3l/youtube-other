# Tasks 09/10/16 Approval

Date: 2026-07-03

Decision: remove the legacy root CLI commands `create`, `run`, `status`, `inspect`, `retry`, and `clean` without transitional aliases.

Decision: remove the legacy `align` root command because it delegates to the same removed `run` handler.

Decision: remove the public workspace package export `@mediaforge/pipeline` from active build wiring.

Replacement operator surfaces: use active `episode`, `stories`, `audio`, `images`, `render`, `metadata`, `transcript`, `youtube`, and `db` commands.

Approval source: human instruction in the Codex session after the initial gate report.
