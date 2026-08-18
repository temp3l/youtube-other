# Veronica Editorial Master v5 — Localization QA

**Status: PASS — full multilingual content pack complete.**

Canonical semantic source: **English editorial master v4**, carried unchanged into v5 except for the already-approved v4 editorial remediations. Localized release languages: **DE, IT, FR, PT**.

| Locale | Stories | Long timing | Short timing | Semantic parity | Narration integrity | Min release rating |
|---|---:|---|---|---|---|---:|
| EN | 24/24 | PASS | PASS | PASS | PASS | 9.6/10 |
| DE | 24/24 | PASS | PASS | PASS | PASS | 9.6/10 |
| IT | 24/24 | PASS | PASS | PASS | PASS | 9.6/10 |
| FR | 24/24 | PASS | PASS | PASS | PASS | 9.6/10 |
| PT | 24/24 | PASS | PASS | PASS | PASS | 9.6/10 |

## Release gates

- 6 long-form + 18 Shorts exist in every locale.
- DE/IT/FR/PT were localized from the current canonical English meaning, not copied from the stale earlier 45–60s translations.
- Thesis, causal chain, examples, warnings, diagnostics and final payoff are preserved beat-for-beat.
- The revised L01-S02 evidence audit, L02-S02 niche-as-wedge logic, L04 recognition system and L06-S03 OLD/NEW/NEITHER 90-day audit are preserved across locales.
- PT narration uses one consistent contemporary **Brazilian Portuguese / você** register; mixed European progressive constructions were removed.
- Narration files contain no Markdown headings, code fences, production bullets or stage directions.
- No TTS, image, render or upload provider calls were made while building the pack.

## Rating gate

- Canonical English stories: **24/24 >9.5/10**, minimum **9.6/10**, average **9.72/10**.
- Localized scripts: **96/96 >9.5/10**, minimum **9.6/10** under the localization-release rubric.
- The localized score is a release score, not a claim that translation alone changes the strategic value of the underlying story. It combines the canonical story score with localization quality gates.

## Timing authority

Word-count/WPM is a preflight estimate only. After TTS, the selected decoded audio duration overrides these estimates and downstream scene/event timing must derive from that selected audio.

Per-file hashes, counts, durations and QA outcomes are in `LOCALIZATION-QA.json`.
