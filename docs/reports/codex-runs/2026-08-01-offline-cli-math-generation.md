# Offline CLI math generation

Changed files: `apps/cli/src/index.ts`, `packages/math-rendering/src/audio/mock-tts.ts`, and `packages/math-rendering/src/composition/remotion-runner.ts`.

Checks: the rebuilt offline CLI displayed `math --help`; the private M5-ZO-001 production preflight passed with zero provider calls. The resumed local workflow passed curriculum, mathematical verification, narration, and local audio stages; final rendering remains in progress in `/tmp/m5-zo-001-production`.

Risks: the standard checked build remains blocked by unrelated existing TypeScript errors. The canonical `production status` command still targets obsolete simulation state for private runs. Final media/quality evidence remains pending render completion.

Follow-up: allow the active resumable render to finish, then inspect its authoritative workflow state and final-media artifacts.
