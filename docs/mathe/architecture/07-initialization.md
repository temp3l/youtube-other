# Repository-Initialisierung

Codex muss zuerst bestehende Strukturen inventarisieren und vorhandene Funktionalität
wiederverwenden.

## Erwartete Bereiche

Die finalen Pfade müssen an das vorhandene Repository angepasst werden:

```text
docs/mathe/
src/math/
  curriculum/
  lesson-spec/
  verification/
  localization/
  visuals/
  rendering/
  metadata/
  orchestration/
python/math-verifier/
assets/math-teacher/
```

## Initialisierung darf

- Dokumente und Schemas integrieren
- Curriculum-Importer und statische Validierung anlegen
- strikt typisierte Interfaces und Ports erzeugen
- SymPy-Protokoll und Mock-Verifier vorbereiten
- Tests für IDs, Schema und DAG anlegen
- Simulation und Dry Run verdrahten
- einen Klasse-5-Pilotpfad vorbereiten

## Initialisierung darf nicht

- produktive kostenpflichtige Provider aufrufen
- Horror-Defaults global verändern
- existierende Pipeline-Kommandos brechen
- unreviewte Datenbankmigrationen ausführen
- Inhalte veröffentlichen
