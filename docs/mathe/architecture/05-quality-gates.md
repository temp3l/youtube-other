# Quality Gates

```ts
type MathProductionStatus =
  | 'READY'
  | 'READY_WITH_MINOR_EDITS'
  | 'REVISION_REQUIRED'
  | 'MATHEMATICAL_ERROR'
  | 'CURRICULUM_ERROR'
  | 'LOCALIZATION_ERROR'
  | 'TIMING_ERROR'
  | 'RENDER_BLOCKED'
  | 'PUBLISH_BLOCKED';
```

## Harte Gates

1. Curriculum-Provenienz und Schema
2. eindeutige IDs und zyklusfreier Voraussetzungengraph
3. genau eine enge Kompetenz
4. unabhängige Prüfung aller Rechnungen
5. vollständige Challenge-Lösung
6. Übereinstimmung von Narration, Formel, Diagramm und Verifier
7. Dauer zwischen 180 und 300 Sekunden
8. Lesbarkeit und Safe Areas in 16:9
9. korrekte lokalisierte Fachbegriffe und Zahlenformate
10. Audio-/Video-Synchronität
11. vollständige Metadaten und Playlist-Zuordnung

`MATHEMATICAL_ERROR` ist immer blockierend und darf nie in eine Warnung umgewandelt werden.
