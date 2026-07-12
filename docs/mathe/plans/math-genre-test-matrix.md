# Mathematik-Genre: Test Matrix

## 1. Teststrategie und Budgets

Die Pyramide priorisiert reine Unit-Tests, danach Paket-Integration und einen kleinen simulierten E2E-Golden-Path. Bezahlte Provider, echte Uploads, Remote-Renderer und öffentliche Netzwerke sind in Tests verboten. Jede Produktionsgrenze erhält einen injizierbaren Port/Fake. Vollständige Repo-Builds oder -Tests werden nur nach expliziter Freigabe ausgeführt.

Standardbefehle:

```bash
pnpm test:focused -- packages/math-education/src/<file>.unit.test.ts
pnpm test:focused -- packages/math-education/src/<file>.integration.test.ts
pnpm test:focused -- packages/math-rendering/src/<file>.unit.test.ts
pnpm test:focused -- apps/cli/src/<file>.unit.test.ts
pnpm --filter @mediaforge/math-education typecheck
pnpm --filter @mediaforge/math-rendering typecheck
pnpm --filter @mediaforge/cli typecheck
```

Der Python-Worker erhält einen eigenen offlinefähigen Testbefehl aus `pyproject.toml`; der exakte Runner wird beim Anlegen des Projekts festgelegt und in CI gepinnt. Testreihenfolge je Task: direkt betroffene Datei, bei Fehler exakter Testname, danach höchstens ein betroffener Paket-Typecheck.

## 2. Funktionale Matrix

| ID | Ebene | Szenario | Erwartung / Assertion | Fixture / Fake |
|---|---|---|---|---|
| C01 | Unit | Gültiger Curriculum-Seed | 206 Skills; Counts 37/34/36/36/33/30; alle drei Varianten; 180/240/300. | Echte `03-machine-readable-seed.md` read-only. |
| C02 | Unit | Unbekanntes Seed-Feld | Striktes Schema lehnt mit JSON-Pfad ab. | Minimaler Seed. |
| C03 | Unit | Doppelte/ungültige Skill-ID | Import blockiert; kein Releaseartefakt. | Duplicate/regex fixtures. |
| C04 | Unit | Markdown enthält null/mehrere JSON-Blöcke | Deterministischer Importfehler statt stiller Auswahl. | Markdown fixtures. |
| C05 | Unit | Quellenstatus/Kohorte | SH `phasing_in/out` mit Kohorte valide; widersprüchliche Zeiträume invalid. | Registry fixture. |
| C06 | Unit | Saarland 9/10 unbestätigt | `unverified`; Rechtsverbindlichkeitsclaim blockiert. | Provenienzfixture. |
| C07 | Unit | State Override | Nur Platzierungsfelder änderbar; Lernziel/Math abgewiesen. | Override fixture. |
| C08 | Unit | Published Release mutiert | Hash-/ID-Historiencheck schlägt fehl. | Vorher/nachher Releases. |
| C09 | Unit | ID-Aufteilung/Zusammenlegung | Neue IDs, append-only `replaces`; Alias nur lesend. | Migration fixture. |
| G01 | Unit | Leerer/linearer/diamond DAG | Stabile topologische Reihenfolge. | Kleine Graphen. |
| G02 | Unit | Zyklus/Selbstkante/Unbekannte ID | Release blockiert, konkrete Kante gemeldet. | Fehlergraphen. |
| G03 | Unit | Cross-Grade-Kante | Normaler Rückverweis erlaubt; Future-Grade nur mit Approval. | Grade fixture. |
| G04 | Unit | Playlistreihenfolge bei Tie | Grade, Seedorder, Skill-ID als reproduzierbare Tie-Breaker. | Tie fixture. |
| L01 | Unit | Foundation/Standard/Challenge | Gemeinsames Ziel, unterschiedliche Scaffolding-/Transfermerkmale. | Drei Varianten eines Skills. |
| L02 | Unit | Near-Duplicate-Varianten | Quality-Check erkennt reinen Text-/Zahlentausch. | Negativfixture. |
| L03 | Unit | Prozesskompetenz nur als Metadatum | Lesson blockiert, wenn keine Szene die Kompetenz sichtbar macht. | Negativfixture. |
| L04 | Unit | Aufgabe ohne vollständige Lösung | Lesson blockiert. | Negativfixture. |
| A01 | Unit | Integer/Rational/Decimal Roundtrip | Keine Präzisionsverluste; Nenner normalisiert; Decimal scale erhalten. | Tabellengetriebene Werte. |
| A02 | Unit | Kommutative Normalisierung | Semantisch gleiche Summen/Produkte hashen identisch. | AST pairs. |
| A03 | Unit | Nichtkommutative Reihenfolge | Quotient/Potenz/Relation hashen unterschiedlich bei Vertauschung. | AST pairs. |
| A04 | Unit | Einheiten | Dimensionsverträglichkeiten/Skalen korrekt; inkompatible Addition blockiert. | Länge, Fläche, Volumen, Zeit. |
| A05 | Unit | Grad/Radiant | Explizite Konversion; kein implizites Angleformat. | Trig fixture. |
| A06 | Unit | Approximation | Nur explizite Toleranz akzeptiert; Float-String ohne Policy blockiert. | Pi/root/trig fixture. |
| V01 | Python Unit | Evaluate/Equivalent | Arithmetik, Brüche, Terme und Umformungen korrekt. | Protocol goldens. |
| V02 | Python Unit | Solve | Gleichung/LGS samt Definitionsbereich und Lösungsmenge korrekt. | Algebra fixtures. |
| V03 | Python Unit | Geometrie/Units | Umfang/Fläche/Volumen und Dimensionscheck korrekt. | Geometry fixtures. |
| V04 | Python Unit | Graph/Probability | Punkt, Steigung, Funktionswert, Pfadsumme und Vierfeldertafel korrekt. | Function/probability fixtures. |
| V05 | Python Unit | Unbekannter Node/Check | `unsupported`, niemals `passed`. | Future-node fixture. |
| V06 | Integration | TS↔Python-Protokoll | Request-ID, Inputhash, Versionen und Resultate stimmen. | Echter lokaler Worker. |
| V07 | Integration | Worker timeout/crash/noisy stdout | Adapter meldet blockierenden `error`; kein Teilresultat reused. | Fake worker scripts. |
| V08 | Unit | Manipulierter Responsehash | Adapter verwirft Response. | Fake process. |
| V09 | Unit | Fact Coverage | Jeder sichtbare Fact hat AST und bestandenen Check; orphan/missing blockiert. | Lesson facts. |
| N01 | Unit | Deutsche Narration mit Fact-Tokens | Alle Tokens genau einmal/in erlaubter Reihenfolge; keine Werte im Prompt dupliziert. | Fake LLM response. |
| N02 | Unit | Promptfingerprint | Änderung an Modul/Schema/Spec ändert Fingerprint; stabiler Input bleibt stabil. | Prompt fixture. |
| N03 | Unit | Horror-Importgrenze | Math-Promptcode importiert keine Story-/Dark-Truth-Module. | Dependency scan test. |
| I01 | Unit | Jede Zielsprache | Fact-/Scene-/Objective-Hashes unverändert; Glossarform korrekt. | `de/en/es/fr/pt` fixtures. |
| I02 | Unit | Token fehlt/dupliziert/umgeordnet | `LOCALIZATION_ERROR`. | Negative locale fixtures. |
| I03 | Unit | Dezimal-/Tausenderformat | Locale-Anzeige korrekt, exakter Wert identisch. | Locale tables. |
| I04 | Unit | False Friend/Source leakage | Glossar-/Leakage-Gate blockiert. | Negative text fixtures. |
| I05 | Unit | Glossarversion ändert sich | Nur abhängige Locale-/TTS-/Metadatenartefakte stale. | Manifest pair. |
| T01 | Unit | Scene plan | Neun Beats, stabile Funktionen, monotone Planzeiten. | Pilot lesson. |
| T02 | Unit | Audio-Reflow | Tatsächliche Segmentdauern ergeben framegenaue, lückenfreie Timeline. | Fake audio durations. |
| T03 | Unit | 179/180/300/301 Sekunden | Nur 180 und 300 inklusive sind zulässig. | Boundary table. |
| T04 | Unit | Cue/Denkpause außerhalb Szene | `TIMING_ERROR`. | Negative timing fixture. |
| S01 | Unit | Mock TTS | Deterministisches WAV, Dauer/Pfad/Fingerprint korrekt. | `MockSpeechProvider`. |
| S02 | Unit | Cache hit/stale | Gleicher Request reused; Lexikon/Voice/Text Änderung invalidiert. | Temp workspace. |
| S03 | Unit | Audio QA | Stille, clipping, falsche Samplerate oder fehlendes Segment blockiert. | Kleine WAV fixtures. |
| S04 | Unit | Itemlokaler TTS-Fehler | Andere Lesson-/Locale-Items laufen weiter. | Fake SpeechProvider. |
| R01 | Unit | AST→KaTeX/SVG | Deterministische Ausgabe, keine ungeprüften LaTeX-Commands. | Formula fixtures. |
| R02 | Unit | Diagrammkomponenten | Alle dargestellten Werte an Fact-IDs gebunden. | Component props. |
| R03 | Unit | Profile 5–7 | Mindestgrößen, max. 3 aktive Hauptobjekte, Teacherregeln. | Layout fixture. |
| R04 | Unit | Profile 8–10 | Kompaktere Limits, max. 5 aktive Hauptobjekte. | Layout fixture. |
| R05 | Unit | Alex-Manifest | Sieben Posen, Hash/Lizenz/Dimensionen; max. 25 % Fläche. | Echte Assets read-only. |
| R06 | Integration | Kleiner Remotion-Render | 1920×1080/30fps, erwartete Framezahl und Audio. | Pilot assets + Mock WAV. |
| R07 | Integration | FFmpeg-Endvalidierung | Codec, Pixel, Audio, Dauer und 16:9 valid. | Render aus R06. |
| R08 | Unit | Safe-Area/Glyphengröße | Verstoß blockiert, nicht nur Warnung. | Negative composition. |
| M01 | Unit | Vollständige Math-Metadaten | Titel, Beschreibung, Kapitel, Keywords, DAG vor/zurück vorhanden. | Pilot lesson. |
| M02 | Unit | Thumbnailtext | 2–5 Wörter; Klasse/Variante/Formel; mobile Lesbarkeit. | Locale metadata. |
| M03 | Unit | Playlistminimum | Klasse + Thema + Variante; lokalisierter Name bei stabilem Key. | Playlist catalog. |
| M04 | Unit | Fehlender Playlist-Key | `PUBLISH_BLOCKED`. | Negative catalog fixture. |
| P01 | Unit | Legacy `playlistId` | Bestehender Episode-Upload erzeugt genau eine unveränderte Zuweisung. | Fake YouTube client. |
| P02 | Unit | `playlistIds[]` | Alle eindeutigen IDs idempotent zugewiesen; Duplikate entfernt. | Fake YouTube client. |
| P03 | Unit | Teilweiser Playlistfehler | Alle Inserts versucht; Pflichtfehler berichtet und Publish blockiert. | Fake client mit einem Fehler. |
| P04 | Unit | Channel mismatch | Vor Upload blockiert. | Fake `channels.list`. |
| P05 | Unit | Fehlende Brandpolicy | Fehlendes `madeForKids`/Privacy/Channelmapping blockiert. | Config fixture. |
| P06 | Unit | Wiederholter Publish-Run | Existierender Report/Video/Playlistzuweisung wird reused, nicht dupliziert. | Temp report + fake client. |
| O01 | Unit | Stage-Fingerprint | Alle Eltern-/Schema-/Prompt-/Asset-/Provider-Versionen enthalten. | Manifest fixture. |
| O02 | Unit | Resume | Identischer Run schreibt nichts und meldet `cached`. | Temp workspace + write spy. |
| O03 | Unit | Gezielte Invalidierung | Parentänderung setzt nur transitive Nachfolger stale. | Stage DAG fixture. |
| O04 | Unit | Korrupte Manifeste | Quarantäne, kein Cachehit, unabhängige Items unberührt. | Truncated JSON. |
| O05 | Unit | Mixed Batch | Erfolg, retryable, terminal und blocked ergeben `partial`; unabhängige Items laufen. | Fake stages. |
| O06 | Unit | Retrybudget | Nur betroffene Stage/Item wird bis Limit wiederholt; kein unveränderter Endlosretry. | Fake clock/provider. |
| O07 | Unit | Quality-Priorität | Fehlerstatus gewinnt in definierter Reihenfolge. | Vollständige Statusmatrix. |
| O08 | Unit | Approval | Minor Edit braucht gültigen zweiten Reviewer; Math Error nie overridebar. | Signed/invalid approval fixtures. |
| D01 | CLI Unit | Dry Run | Null Writes, null Subprozesse, null Provider; Plan/Pfade/Kosten/Blocker ausgegeben. | Injected spies. |
| D02 | Integration | Simulation | Nur expliziter Temp-Workspace; `paidProviderCalled=false`; Mock-TTS und echter lokaler SymPy erlaubt. | Fake providers + worker. |
| D03 | CLI Unit | Paid/Publish Guards | Fehlendes `--allow-paid-providers`/`--publish` blockiert vor Dispatch. | Dispatch spy. |
| D04 | CLI Unit | Defaultselektion | Math allein: Grade 5, standard, de; Storydefaults unverändert. | CLI parse tests. |
| D05 | CLI Unit | Exitcodes | 0 success, 1 input/config, 2 partial, 3 alle blockiert. | Fake runner outcomes. |
| E01 | E2E Simulation | `M5-ZO-001-standard-de` | Import bis Quality vollständig; exakte Verifikation; Render/Metadaten/Playlists ready. | Versionierter Pilot. |
| E02 | E2E Resume | E01 unverändert wiederholen | Alle geeigneten Stages cached, Outputhashes identisch. | Workspace aus E01. |
| E03 | E2E Isolation | Zwei Lessons, eine defekte Locale | Gesunde Lesson endet ready; Batch partial; Fehlerreport präzise. | Zwei-Lesson fixture. |
| H01 | Regression | Story CLI/Config | Bestehende Help-, Default- und Plan-Tests bleiben grün. | Vorhandene Tests. |
| H02 | Regression | Speech | Story-Narration `full`/`short` und Validatorverhalten unverändert. | Vorhandene fokussierte Speech-Tests. |
| H03 | Regression | YouTube Upload | Alter Episode-Wrapper und Single-Playlist-Report unverändert. | Vorhandene Uploadtests. |
| H04 | Regression | Horror Thumbnail | Horror-Stile/Prompts/Defaults unverändert; Math importiert sie nicht. | Vorhandene Thumbnailtests + Importscan. |

## 3. Fixture-Strategie

```text
packages/math-education/src/__fixtures__/
  curriculum/{minimal-valid,invalid,cycle}/
  math-spec/{arithmetic,algebra,geometry,probability}/
  localization/{de,en,es,fr,pt,invalid}/
  workflow/{resume,partial,corrupt}/
  pilot/m5-zo-001-standard/
packages/math-rendering/src/__fixtures__/
  components/
  pilot/m5-zo-001-standard/
python/math-verifier/tests/fixtures/
  protocol-v1/{valid,failed,unsupported,invalid}/
```

- Fixtures sind klein, menschenlesbar und tragen Schema-/Producer-Versionen.
- Keine vollständigen Produktionsvideos, generierten Assetbäume oder Base64-Daten einchecken.
- SVG/JSON-Goldens prüfen semantische Felder und stabile Hashes; keine breiten Vollobjekt-Snapshots.
- Renderintegration erzeugt temporäre Medien und prüft Metadaten/Frames statt Binärgleichheit des MP4.
- Randomisierte AST-Tests verwenden einen festen Seed und persistieren den minimalen Gegenbeispielwert im Fehlerlog.
- Fixtureänderungen werden als Produktionsdefekt, genehmigte Vertragsänderung, stale Fixture oder fremder Fehler klassifiziert. Nur genehmigte Vertragsänderungen aktualisieren Fixtures.

## 4. Release-Gates

| Gate | Erforderliche Nachweise |
|---|---|
| Schema/Graph bereit | C01–C09, G01–G04 grün; echte Release-Dateien strikt validiert. |
| Verifier bereit | A01–A06, V01–V09 grün; gepinnte Python-/SymPy-Version; Cross-Language-Goldens. |
| Locale bereit | N01–N03, I01–I05 je aktivierter Sprache grün; Glossarreview dokumentiert. |
| Render bereit | T01–T04, S01–S04, R01–R08 grün; kleiner lokaler Render FFmpeg-validiert. |
| Publish bereit | M01–M04, P01–P06 grün; Channel/Policy/Playlist-Preflight mit Fake und privater manueller Kontrolle. |
| Pilot bereit | O01–O08, D01–D05, E01–E03 sowie H01–H04 grün. |

Ein öffentlicher Rollout ist zusätzlich an fachliches Vier-Augen-Review der Pilotvideos, Brand-/Legal-Freigabe und einen separaten expliziten Publish-Run gebunden.
