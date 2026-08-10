# Veronica semantic prompt hardening

Changed files: `packages/shared/src/semantic-image-prompt.ts`, `packages/strategic-reinvention/src/semantic-image-prompt.ts`, and `packages/strategic-reinvention/src/semantic-image-prompt.unit.test.ts`.

Implemented a Veronica-only final-prompt projection hardening pass: neutral unsupported subject descriptors, approved-continuity retention, deterministic negative-constraint categories, one canonical text-free rule, and adapter cache version `v2` → `v3`. Shared History defaults remain unchanged.

Checks run: shared and strategic package builds/typechecks; focused Veronica adapter tests (11 passed); shared semantic prompt tests (4 passed); History semantic prompt tests (6 passed); targeted ESLint; `git diff --check`.

Results: V03 projects to 319 words and retains its approved comparison semantics without the legacy abstract treatment.

Risks/follow-up: the repository has unrelated pre-existing worktree changes; no providers or images were invoked. Commit hash: uncommitted.
