# ADR-MICRODRAMA-004: One canon, locale projections, and selected-audio timing

Date: 2026-08-12
Status: accepted

## Context

The V5 remediated `7 MINUTES AHEAD` pack contains 100 narrative episodes and four
supplied locale scripts per episode. V4 lineage and a heritage 160 WPM field may
appear in older packs but do not govern the current corpus.

## Decision

Maintain one language-neutral canon and one canonical identity per episode.
`en-US`, `de-DE`, `es-ES`, and `pt-BR` scripts are imported approved locale
ScriptRevisions, not independent episode canons and not generation requests.

V5 locale lexical admission uses 155 WPM for en-US/es-ES/pt-BR and 150 WPM for
de-DE, with the declared word and 56–62 second lexical gates. Heritage single-value
160 WPM fields are not runtime authority. After TTS selection, measured selected audio and its
alignment are the final locale timing authority for scenes, shots, subtitles,
UI, and render.

Visual semantics and approved source assets are shared across locales by
default. TTS, timing, subtitles, localized UI, metadata, and final composition
are locale projections. Any visual locale fork records an explicit reason.

## Consequences

- Cache and invalidation identities distinguish shared visual semantics from
  locale-specific outputs.
- A wording-only revision does not invalidate other locales or shared visuals.
- Audio gates are calibrated separately from lexical gates after E001–E003.
- New locales use explicit localization/admission work and do not alter V5
  imported revisions.

## Alternatives rejected

- Four independent story databases or episode identities.
- English prose or screenshots as the sole semantic canon.
- Regenerating supplied translations.
- Using 160 WPM or lexical estimates as final selected-audio timing.
- Regenerating images solely because dialogue language changes.
