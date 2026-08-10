# Veronica Short pacing tolerance

Date: 2026-08-10

Added a Short-only `durationToleranceSeconds: 0.25` policy field. The creative range remains 58–60 seconds; the new 57.75–60.25 second band prevents a further paid synthesis only when decoded audio and hard constraints pass. Calibration now records `WITHIN_PREFERRED_RANGE`, `WITHIN_ACCEPTANCE_TOLERANCE`, or `PACING_TARGET_MISSED` separately from its WPM diagnostic.

The L02-S02 cached 57.916s candidate was promoted with zero new TTS calls, selected at speed 1.0162, and reported as `WITHIN_ACCEPTANCE_TOLERANCE` / `slightly-fast` (166.8 WPM). Canonical scene/event/cadence timing is 57.916s. A fresh pack was generated at `run-1786379109730`; manifest hashes validated and image requests remain blocked.

Checks: 6 focused pacing tests passed; speech build passed. CLI typecheck is blocked by existing errors in episode-layout migration, image-resume, and metadata code; no errors remain in changed pacing files.
