# Zielarchitektur

```text
official curriculum sources
  -> source registry
  -> normalized curriculum graph
  -> skill and three lesson variants
  -> exact mathematical specification
  -> independent deterministic verification
  -> canonical German narration
  -> visual and timing plan
  -> locked-fact localization
  -> formula and diagram assets
  -> TTS
  -> Remotion composition
  -> FFmpeg validation
  -> metadata and playlists
  -> quality gate
  -> publish
```

## Empfohlener Rendering-Stack

- LaTeX als mathematische Quellnotation
- KaTeX oder MathJax zur kontrollierten SVG-Erzeugung
- SVG als stabiles Zwischenformat
- typisierte Remotion-Komponenten für Szenen und Timing
- eigene SVG-Komponenten für Zahlenstrahl, Koordinatensystem, Geometrie,
  Tabellen, Baumdiagramme und Wahrscheinlichkeitsdarstellungen
- FFmpeg für finale Medienvalidierung und Encoding

Manim kann später für spezielle Visualisierungen ergänzt werden, sollte aber nicht die
primäre Pipeline eines TypeScript-Systems bilden.
