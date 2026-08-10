# Veronica adaptive Short TTS pacing

Date: 2026-08-10

Implemented measured-audio adaptive pacing for `veronicabenini/short` only. A versioned policy uses 58–60s duration as its primary target, with locale guidance and bounded provider-native speed corrections. Calibration candidates and the selected WAV are cached separately, then the selected candidate is promoted to the existing canonical narration paths. The review pack now consumes and hashes the calibration artifact rather than reporting a hard-coded TTS speed.

Changed: `packages/speech/src/veronica-short-pacing.ts`, its unit test and export; `apps/cli/src/veronica-short-pacing.ts`, CLI orchestration, and review-pack diagnostics.

Checks: pacing unit test passed; speech typecheck/build passed; CLI typecheck remains blocked by pre-existing errors in episode-layout migration, images-resume, and metadata command files (no errors in the new files); fresh pack hashes and ZIP validated.

Live English calibration made 3 TTS calls: 1.16/51.687s, 1.0162/57.916s, 0.9975/59.439s selected (162.5 WPM). No image provider call. Risk: the shared staged quality gate retains baseline chunk metadata while selected complete narration is tracked by the calibration artifact.
