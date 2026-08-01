# Multilingual Strategy

## Canonical language

For this creator, **Italian must be canonical**.

The current Mediaforge locale model uses:

```text
en, de, es, fr, pt
```

Add:

```text
it
```

Do not translate an English reconstruction of an Italian source. The correct chain is:

```text
Italian human source
  → approved Italian script
  → language-specific adaptation
  → native review
  → dubbed audio, subtitles and localized metadata
```

## Translation modes

### Literal-safe

Use for:

- factual instructions;
- lists;
- simple planning steps;
- technical product explanations.

### Cultural adaptation required

Use for:

- humour;
- slang;
- playful brand terms;
- feminist and political framing;
- personal stories;
- Italian workplace or cultural examples;
- calls to action linked to market-specific products.

## Protected terms

The creator profile contains terms that should remain unchanged unless Veronica
approves a localized form:

- Spora
- StoryFaiga
- MULTIFAIGA
- VIAGGETTY
- LAVORETTY
- Corsetty
- PRESENTE
- Revoluscion

Each localized script should include a terminology report:

```json
{
  "preservedTerms": [],
  "adaptedTerms": [],
  "reviewNotes": []
}
```

## Publishing model

Preferred:

- one canonical video;
- localized title and description;
- language subtitles;
- reviewed additional audio tracks;
- language-specific CTA destination.

Fallback:

- separate rendered video per language only where the upload integration cannot attach
  additional audio tracks or the market requires materially different visuals/content.

## Voice policy

Priority:

1. Veronica records the canonical Italian audio.
2. Approved human dub actor.
3. Approved synthetic voice that is not presented deceptively.
4. YouTube auto-dub for low-risk experiments with manual publication review.

Voice cloning is disabled by default.

## Localization QA

Every language requires:

- semantic review;
- tone review;
- terminology review;
- claims/citations review;
- CTA and pricing review;
- subtitle timing review;
- pronunciation review;
- thumbnail text review.

## Language rollout

### Stage 1

Italian only. Prove the editorial and production loop.

### Stage 2

English and Spanish for the best-performing evergreen episodes.

### Stage 3

German and French based on watch-time and conversion evidence.

### Stage 4

Portuguese after the localized production and review workflow is stable.

## Technical output paths

Preserve the established Mediaforge paths:

```text
episodes/<id>/languages/script-it.md
episodes/<id>/languages/script-en.md
episodes/<id>/languages/script-es.md
episodes/<id>/languages/script-de.md
episodes/<id>/languages/script-fr.md
episodes/<id>/languages/script-pt.md

episodes/<id>/languages/short/script-it.md
episodes/<id>/languages/short/script-en.md
...
```

All active code must resolve these through `createEpisodePathResolver`.
