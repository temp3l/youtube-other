# Merge Editorial Review

## Personas / review lenses

- **YouTube retention editor:** preserve strong hooks and final payoffs; target Shorts around 90 seconds and longs around 10 minutes.
- **Story editor:** remove exact and near-duplicate story angles while retaining materially different treatments of adjacent themes.
- **Localization editor:** preserve existing locale coverage and semantic intent; do not fabricate missing Pack 1 Spanish localization.
- **Content-pipeline engineer:** create stable IDs, a machine-readable manifest, deterministic timing reports, provenance, and checksums.

## Editorial decisions

- Pack 1 `editorial-master-v5` is the canonical positioning source. Earlier Pack 1, `packed`, and `v3-50s` exports are superseded.
- Pack 2 `v4-editorial-continuity-remediation` is the canonical offer/sales/conversion source. The nested `vero/veronica-content-pack-2` narration tree is byte-identical and removed. The older offer/sales v2 narration export is superseded.
- Transcript wave `L022` was excluded because its offer-design thesis overlaps Pack 2 long `osc-l04`.
- Transcript wave `S001` was excluded because it duplicates Pack 1's "being good isn't enough" Short.
- Transcript wave `S031` and `S041` were excluded because both overlap the customer-buys-the-outcome thesis retained in Pack 2 `osc-s03a`.
- Transcript wave `L004`, `L011`, `L018`, `L050`, `S021`, and `S027` were retained because they add distinct editorial territory.

## Timing result

- All **188 Short narration files** pass the preferred pre-TTS word bands.
- English Shorts: **01:27–01:33**, average **01:30**.
- All **82 long narration files** pass the 09:30–10:30 pre-TTS window.
- English longs: **09:46–10:19**, average **10:03**.

## Pack 2 Short normalization

Pack 2 originally optimized Shorts for roughly 65–85 seconds internally. The unified pack changes that policy to ~90 seconds. Each Pack 2 Short received a small, topic-specific depth insertion immediately before the existing final payoff/CTA. Hooks, core thesis, and final payoff were preserved.

This is a **new narration revision**, so the old Pack 2 story ratings should not be treated as automatically re-certifying the changed text. Deterministic timing passes, but selected TTS audio and a final native-listening/editorial check remain the publication authority.

## Duplicate-risk review

No byte-identical production narration files remain in the unified `content/` tree. High lexical similarity inside the six-part positioning long series reflects shared vocabulary and deliberate series continuity; the retained episodes still have distinct jobs (expertise visibility, niche selection, expert positioning, content recognition, book authority, and repositioning).

## Release status

**MERGE_COMPLETE / PRE-TTS_READY**

The pack is suitable for downstream TTS/visual planning. Final publication readiness still requires selected-audio timing/pronunciation/native-listening QA, especially for Pack 2 Shorts modified during this merge.
