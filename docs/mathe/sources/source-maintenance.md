# Quellenpflege und Aktualisierung

Vor jeder größeren Curriculum-Veröffentlichung:

1. Gültigkeit und Abrufbarkeit jeder offiziellen Quelle prüfen.
2. Neue Dokumentversionen anhand Metadaten und Inhalt erkennen.
3. Kompetenzänderungen semantisch diffen.
4. Betroffene kanonische Skills markieren.
5. Keine veröffentlichte Skill-ID ohne Migration verändern.
6. Länder-Overrides aktualisieren.
7. Änderungen mit Datum, Quelle und Begründung protokollieren.

## Quellenstatus

```ts
type CurriculumSourceStatus =
  | 'current'
  | 'phasing_in'
  | 'phasing_out'
  | 'superseded'
  | 'unverified';
```

Schleswig-Holstein benötigt wegen der aufwachsenden Einführung 2024 eine kohortenbezogene
Statusmodellierung. Saarland benötigt eine erneute Inventarisierung der aktuellen
Anschlusspläne für 9/10, bevor ein Saarland-spezifischer Vollständigkeitsanspruch erhoben wird.
