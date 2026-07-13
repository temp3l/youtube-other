# ADR 010: Formula renderer

Accepted. KaTeX was audited as a validator only: its HTML/MathML output requires browser-style layout and
cannot be passed to librsvg as contained SVG. No local browser, SVG converter, or compatible MathJax SVG
package was available without adding a dependency. The renderer therefore uses one native, deterministic
SVG math layout (`native-svg-math.v1`) for the supported grade 5–10 TeX subset. It emits SVG text and paths
only (no `foreignObject`), lays out fractions, roots, superscripts and subscripts, and uses the configured
open font for glyphs. Unknown commands and markup fail with `INVALID_FORMULA`; no fallback text exists.

The formula renderer identity, SVG renderer identity, configured font hash, profile, and FFmpeg identity are
part of every scene key. This corrects output semantics without changing request version 1; the internal
renderer/cache format identity is `educational-video.v2` / `svg-static.v3`.
