# Linux Math Renderer Completion Prompts

Use these prompts in order. Each is intentionally bounded and should be executed in a separate Codex
task so verification and repair remain within the repository limits.

1. [Audit blocker repairs](00-audit-blocker-repairs.md): isolate the change set, close the critical
   writable-path symlink escape, repair CLI failure/overwrite semantics, fix packed-package acceptance,
   strengthen package boundaries, and sanitize public failures.
2. [Release acceptance](01-release-acceptance.md): prove the packed package, installed bin, CLI failure
   semantics, process-death recovery, frozen lockfile, and isolated CI.
3. [Visual correctness](02-visual-correctness.md): replace formula text approximation, cover every scene
   type and layout, and settle the public transition contract.
4. [Operational completeness](03-operational-completeness.md): make capabilities and benchmarks truthful,
   run optional hardware self-tests where possible, and perform final release acceptance.

Do not combine these prompts. Batch 1 depends on Batch 0 passing, Batch 2 depends on Batch 1, and Batch 3
depends on all earlier batches.
None of the batches may register the renderer in `apps/cli` or a production Mediaforge pipeline.
