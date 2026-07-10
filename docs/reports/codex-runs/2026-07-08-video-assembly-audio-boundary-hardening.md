# Video Assembly Audio Boundary Hardening

Date: 2026-07-08

Summary: Fixed clip-boundary audio risk by rendering scene clips as video-only, concat-copying only visual clips, and muxing one continuous narration track normalized to AAC/48000 Hz/stereo. Added render-manifest `audioAssembly` diagnostics for per-clip expected duration, actual video duration, source-audio duration, drift, total drift, final narration duration, and warning/failure thresholds.

Changed paths: `packages/rendering/src/index.ts`; `packages/rendering/src/index.unit.test.ts`; `docs/architecture/video-audio-assembly-contract.md`; `docs/reports/codex-runs/2026-07-08-video-assembly-audio-boundary-hardening.md`.

Tests/checks: `pnpm test:focused -- packages/rendering/src/index.unit.test.ts` passed, 31 passed and 4 todo. `pnpm --filter @mediaforge/rendering typecheck` passed. `git diff --check -- packages/rendering/src/index.ts packages/rendering/src/index.unit.test.ts docs/architecture/video-audio-assembly-contract.md` passed.

Commit hash: not created.

Risks remaining: Existing cached scene clips with old audio streams may still exist until their fingerprints trigger rerender. Caption burn-in still interpolates subtitle paths directly; existing todo remains. No real episode 025 render was run.

Follow-up: Rerender episode 025 locally and inspect `render.json` `audioAssembly.warnings`.
