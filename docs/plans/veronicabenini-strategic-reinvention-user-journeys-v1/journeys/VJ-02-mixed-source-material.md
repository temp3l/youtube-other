# VJ-02 — Create an Episode from Mixed Source Material

## Primary actor
Creator / Channel Owner

## Trigger
The creator provides one or more PDFs, slide decks, documents, images, screenshots, or prepared copy.

## Main flow
1. Creator attaches source assets.
2. System fingerprints each asset and stores immutable source metadata.
3. System identifies asset type, page/slide structure, extractable text, visual regions, and reusable media.
4. System builds a source manifest without modifying originals.
5. Creator can mark source items as mandatory, optional, forbidden-for-display, or context-only.
6. Production agent derives episode structure from the full source manifest.
7. Reusable source visuals are preferred over unnecessary generated replacements.
8. Extracted text that will appear on-screen is tracked as localizable content.
9. Source citations/provenance are retained internally through narration and visual-plan derivation.
10. Review pack shows source-to-output lineage.

## Alternate flows
- Duplicate files: deduplicate by content fingerprint while retaining references.
- Low-quality page/slide: agent may redesign a presentation frame while preserving meaning.
- Source image unsuitable for 9:16: crop/reframe or compose into a redesigned vertical layout.
- Source includes private/context-only pages: these may influence narration but must not appear in final visuals.

## Success outcome
A canonical, typed source manifest drives production and allows selective reuse/localization.

## Failure expectations
- Unsupported files fail individually without discarding valid files.
- Extraction failure does not corrupt originals.
- A re-upload of unchanged content reuses extraction results.
