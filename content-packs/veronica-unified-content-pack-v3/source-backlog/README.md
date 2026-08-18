# Transcript → YouTube Content Pack v1

This pack converts **101 Italian transcript sources** (~325,422 words / ~34.8 hours) into a source-grounded editorial slate of **50 Shorts + 50 long-form videos**.

## Locked production targets

- **Shorts:** ~1:30 at ~155 WPM → canonical target **232 words** (±12).
- **Long-form:** ~10:00 at ~155 WPM → canonical target **1,550 words** (±75).

These are narration targets, not raw source lengths. Scripts should optimize spoken rhythm first while remaining inside the tolerance unless an editorial exception is explicitly approved.

## Contents

- `EDITORIAL-PERSONA.md` — persona and non-negotiable editorial rules.
- `story-slate.md` — ranked human-readable list of all 100 concepts.
- `story-slate.json` — machine-readable slate for automation.
- `sources/source-index.md` — all 101 sources with duration, word count, and mechanical transcript-quality flag.
- `sources/source-library.json` — normalized full transcript text + metadata + provenance IDs.
- `shorts/` — 50 production briefs.
- `longs/` — 50 production briefs.

## Recommended production order

Start with the highest-ranked concepts, but preserve pillar diversity rather than publishing ten near-identical positioning videos in sequence. A good first production wave is:

1. `S031` — People Don't Buy Services. They Buy Change
2. `S041` — Your Customer Isn't Buying Your Solution
3. `S001` — Why Being Good at Your Job Isn't Enough
4. `S021` — Cheap Pricing Can Make You Harder to Trust
5. `S027` — Never Discount a Weak Offer
6. `L050` — The Expert Business Flywheel
7. `L004` — How to Differentiate When Everyone Offers the Same Thing
8. `L011` — Build a Signature Method People Can Understand and Buy
9. `L018` — The Psychology of Memorable Business Storytelling
10. `L022` — How to Design an Offer People Can Say Yes To

## Source-safety gate

The transcript quality flag is intentionally conservative. A `noisy` source may still contain strong ideas, but generated scripts must not inherit garbled wording or unsupported details from it. For every story:

`source retrieval → semantic reconstruction → cross-source synthesis → external fact-check where needed → original script → editorial QA → timing QA → localization`

## Recommended next implementation step

Generate scripts for the first production wave using the per-story briefs and source-library retrieval, then score each script for hook, retention architecture, clarity, originality, source fidelity, factual risk, spoken naturalness, and timing. Require remediation before production when any critical dimension fails.
