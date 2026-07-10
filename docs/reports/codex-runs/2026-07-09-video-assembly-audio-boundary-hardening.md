# Video Assembly Audio Boundary Hardening

Date: 2026-07-09

Summary: Investigated episode `025-the-endless-backrooms` and confirmed the glitch source in the already-rendered `2026-07-08` artifacts: scene clips, the visual concat, and the final full render all carried embedded AAC audio (`24000` Hz mono), which is consistent with per-clip audio encode plus concat-copy boundary artifacts. Hardened the renderer so scene clips, shot clips, remote partial clips, derived-shot cache hits, reusable cached scene clips, and the intermediate visual concat are all validated as video-only before final mux. Added a regression test that forces a legacy cached clip with embedded audio and verifies it is rejected and rebuilt.

Changed paths: `packages/rendering/src/index.ts`; `packages/rendering/src/index.unit.test.ts`; `docs/architecture/video-audio-assembly-contract.md`.

Tests/checks: `pnpm test:focused -- packages/rendering/src/index.unit.test.ts` passed (32 passed, 4 todo). `pnpm --filter @mediaforge/rendering typecheck` passed. `git diff --check -- packages/rendering/src/index.ts packages/rendering/src/index.unit.test.ts docs/architecture/video-audio-assembly-contract.md` passed.

Commit hash: not created.

Unresolved risks: existing episode 025 outputs were not rerendered in this task, so their on-disk MP4s still reflect the old assembly path until rerendered.
