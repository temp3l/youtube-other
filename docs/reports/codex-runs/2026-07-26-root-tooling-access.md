# Root tooling access

Summary: Declared `tsx` and `vite` as root development dependencies alongside
the existing Vitest/jsdom test stack. The documented `pnpm exec tsx` resume
form and root Vite/Vitest binaries no longer depend on optional or transitive
packages.

Changed paths: `package.json`, `docs/development/commands.md`, and this report.
`pnpm-lock.yaml` already contains the matching resolved entries at commit
`b0286bd044b76dda679f08744f59e005e25a8377`.

Tests/checks: frozen lockfile validation passed; `pnpm exec tsx -e` printed
`tsx-runtime-ok`; Vite reported `7.3.5`; Vitest reported `3.2.6`; focused
`command-option-helpers.unit.test.ts` passed (1/1); the resume `.mjs` passed
`node --check`.

Risks remaining: The expensive acceptance render itself was not started.
Fresh clones still require `pnpm install` before these binaries are available.

Follow-up: none.
