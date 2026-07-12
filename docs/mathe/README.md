# Mathematik-Genre: Curriculum- und Implementierungspaket

Dieses Paket ist zum Entpacken nach `docs/mathe/` vorgesehen.

## Enthalten

- aufbereitete, länderübergreifend normalisierte Fachanforderungen Mathematik für Klassen 5–10
- offizielle Quellen und Gültigkeitshinweise
- ein kanonischer, atomarer Videolehrplan
- drei Schwierigkeitsvarianten je Kompetenz
- Zielarchitektur, Datenmodell, Quality Gates und Lokalisierungskonzept
- Codex-Prompt zur Planerstellung
- Codex-Prompt zur Initialisierung und Implementierung

## Festgelegtes Produkt

- eigenständige Bildungsmarke
- ein YouTube-Kanal je Sprache: Deutsch, Englisch, Spanisch, Französisch, Portugiesisch
- deutscher Gemeinschaftsschul-Lehrplan als kanonische Grundlage
- identisches Lernziel, identische Mathematik und identische Szenenfunktion in allen Sprachen
- 3–5 Minuten pro Video
- genau eine enge Kompetenz je Video
- Varianten `foundation`, `standard` und `challenge`
- Voice-over mit animierten Formeln, Diagrammen und geometrischen Darstellungen
- Digital-Classroom-Stil mit wiederkehrender Lehrkraftfigur
- vollständige Metadaten und mehrere Playlist-Dimensionen
- unabhängige deterministische Prüfung aller Rechnungen

## Initialer Umfang

| Klasse | Kompetenzen | Drei Varianten |
|---:|---:|---:|
| 5 | 37 | 111 |
| 6 | 34 | 102 |
| 7 | 36 | 108 |
| 8 | 36 | 108 |
| 9 | 33 | 99 |
| 10 | 30 | 90 |

Gesamt:

- **206** enge Kompetenzen
- **618** deutschsprachige Video-Varianten
- **3090** mögliche Sprach-Video-Artefakte in fünf Sprachen

## Verwendung

1. ZIP-Inhalt nach `docs/mathe/` entpacken.
2. `prompts/01-plan-implementation.md` in Codex Plan Mode ausführen.
3. Den erzeugten Plan prüfen und committen.
4. `prompts/02-implement-math-genre.md` in Codex ausführen.
5. Zuerst ausschließlich Simulation, Schema-Validierung und eine Pilotkompetenz aus Klasse 5 verwenden.

## Wichtige Einordnung

Die Markdown-Dateien sind eine redaktionell normalisierte Synthese mehrerer offizieller
Fachanforderungen. Sie sind keine rechtsverbindliche Kopie eines einzelnen Landeslehrplans.
Jahrgangszuordnungen unterscheiden sich zwischen Bundesländern, Schulformen und
Anforderungsniveaus. Deshalb werden stabile kanonische Skills mit Quellenprovenienz,
Platzierungssicherheit und späteren Länder-Overrides empfohlen.
