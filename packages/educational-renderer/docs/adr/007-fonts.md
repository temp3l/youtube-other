# ADR 007: Font strategy

Accepted. Require an explicit open font file, defaulting to DejaVu Sans. Missing files fail closed. The
exact file is referenced by generated SVG `@font-face`, and its hash is part of scene identity. Silent
substitution and proprietary bundled fonts are prohibited.
