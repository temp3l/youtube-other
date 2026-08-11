# QA Report — Veronica YouTube-Optimized v2

## Result

**PASS**

## Coverage

- 40 localized long narrations
- 80 localized Shorts
- 40 localized packaging files
- 120 mock audio fixtures
- 24 canonical editorial ratings

## Timing

- Long target: 570–630 s
- Observed mock long range: 570.0–630.0 s
- Short target: 60–90 s
- Observed mock Short range: 60.0–90.0 s

## English Shorts calibration

Configured target: **155 WPM**

- Preferred range: 145–165 WPM
- Soft range: 135–175 WPM
- Observed effective mock-calibrated range: **154.9–155.1 WPM**
- Preferred-range passes: **16/16**

## Localization QA

- CTA English-leak check outside `en-US`: PASS
- Packaging carries localized title/thumbnail options and a native CTA.
- Italian remains the semantic source; localized scripts are transcreated rather than forced into sentence-level equivalence.

## Editorial gate

- Long-form stories passing ≥9.5/10: **8/8**
- Shorts passing ≥9.5/10: **16/16**

## Important limitation

Mock audio is synthetic silence. It validates timing-dependent pipeline behavior only. Before publication, replace it with real selected TTS, re-measure exact duration, run native listening/pronunciation/prosody QA, and perform bounded retiming if necessary. Never add dead air or unnaturally slow speech merely to satisfy the target duration.

## Issues

- None.
