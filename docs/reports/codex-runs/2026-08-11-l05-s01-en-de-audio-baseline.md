# L05-S01 EN/DE audio baseline

Date: 2026-08-11

Changed files: `packages/speech/src/voice-settings.ts`,
`packages/speech/src/narration-quality-gate.ts`,
`packages/speech/src/narration-pipeline.ts`, and their focused tests.
Generated episode artifacts were refreshed under
`episodes/l05-s01-you-dont-need-a-publisher/`.

Checks: focused speech-rate/pacing/timing tests (one unrelated pre-existing
voice-settings authorization test failed); narration-quality-gate tests passed
(7); `@mediaforge/speech` build passed after the fix.

Result: DE selected audio was rebuilt and policy-compatible (72.496s,
140.70 WPM after spoken-text normalization). EN was rebuilt but remains
`READY_WITH_WARNINGS` (52.850s, 173.70 WPM) because current v3 calibration
accepts `SLIGHTLY_FAST` as a safe natural candidate. The fresh shared v2.2
plan has seven semantic scenes. DE projection correctly failed closed with
`VERONICA_LOCALIZED_SEMANTIC_DIVERGENCE_REQUIRES_EXPLICIT_LOCALE_OVERRIDE`.

No image, thumbnail, render, publication, playlist, or paid visual-QA calls
were made. Follow-up: approve an explicit DE semantic override and decide
whether the current calibration policy should remediate `SLIGHTLY_FAST` EN
candidates before resuming deterministic visual planning.
