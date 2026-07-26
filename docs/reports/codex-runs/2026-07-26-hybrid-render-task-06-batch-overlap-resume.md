# Hybrid Render Task 06: Batch Overlap And Resume

Date: 2026-07-26  
Commit: `0232e24`

Summary: Added the canonical math staged scheduler, atomic resumable scene
queue, serial paid-speech/cost gate, shared hybrid lane observer, remote job
tracking, fragment-aware resume, bounded render-ready window, partial outcome
preservation, cancellation state, and per-unit workflow locking. CLI batch
run/resume now use one shared render execution while `BatchCoordinator`
persists authoritative item outcomes. Task 05 and owner-attestation reports now
correctly reference `43745c4`.

Changed paths: `apps/cli/src/math-commands*`,
`apps/cli/src/math-render-hybrid.ts`,
`apps/cli/src/math-private-batch-scheduler*`,
`packages/math-education/src/task-registry.ts`, and the Task 05, attestation,
implementation, and run reports.

Tests: focused scheduler test file, 5 passed; focused CLI batch run/resume test,
1 passed; `pnpm --filter @mediaforge/cli typecheck`, passed.

Unresolved risks: no live providers, 37-lesson batch, Docker, remote transport,
VPS work, publication, or broad checks ran. The final terminal predicate was
not rerun after the authorized one-typecheck budget was consumed.
