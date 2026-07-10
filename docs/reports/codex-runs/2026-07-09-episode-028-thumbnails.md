# Episode 028 Thumbnails

Date: 2026-07-09
Commit: 9e3ba73

Changed files:
- `episodes/028-the-man-in-the-attic/thumbnails/backgrounds/full-en.png`
- `episodes/028-the-man-in-the-attic/thumbnails/backgrounds/short-en.png`
- `episodes/028-the-man-in-the-attic/thumbnails/backgrounds/short-de.png`
- `episodes/028-the-man-in-the-attic/thumbnails/full/en.png`
- `episodes/028-the-man-in-the-attic/thumbnails/full/de.png`
- `episodes/028-the-man-in-the-attic/thumbnails/short/en.png`
- `episodes/028-the-man-in-the-attic/thumbnails/short/de.png`
- `episodes/028-the-man-in-the-attic/thumbnails/manifests/*.json`

Summary:
Generated the English full thumbnail through OpenAI using `editorial-card`. The default cinematic request, German full request, and English short request were blocked by OpenAI output moderation. German full and both short thumbnails were composed locally from the approved English full background; short backgrounds were locally reframed to 9:16.

Tests/checks:
- Parsed all final and background manifests with thumbnail schemas.
- Verified PNG dimensions: full `1920x1080`, short `1080x1920`.
- Visually inspected all four final thumbnails.

Risks:
- German full and short variants reuse/reframe the English approved background rather than provider-generated locale-specific backgrounds.

Follow-up:
- If stricter locale-specific visual provenance is required, create a milder provider prompt and regenerate the blocked variants.
