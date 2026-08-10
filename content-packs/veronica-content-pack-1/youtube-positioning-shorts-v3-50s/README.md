# YouTube Positioning Shorts — v3 50-second narration pack

This package updates all 18 Shorts across EN, DE, IT, FR and PT: **90 narration files**.

The original v2 scripts averaged roughly 88–97 words depending on locale and produced real rendered videos as short as ~22 seconds. v3 expands each script into a complete micro-lesson while preserving the original positioning thesis and content IDs.

## Use
1. Feed `shorts/{locale}/*.md` directly to TTS.
2. Measure actual audio duration.
3. Accept 45–60 seconds; prefer 50–55 seconds.
4. For a miss, remediate only that locale's narration.
5. Freeze narration/TTS before final image/video regeneration.

## Canonical visual plans

`visual-review/plans/` contains one validated, locale-independent visual plan for each of the 18 Shorts. Each plan is derived from its English v3 narration and is reused across all five locales; localized title-overlay QA lives in `visual-review/localization/`.

The plans use 6–7 scenes (including the hook), 11–13 visual events, and calibrated English durations of 46.4–54.6 seconds. See `visual-review/VALIDATION.md` for the audit record.

See `PRODUCTION-REVIEW.md` and `meta/runtime-calibration.json`.
