# Mathematik-Genre: dependency-ordered Task Breakdown

Jede Aufgabe ist einzeln review- und rollbackbar. Tests werden nach `AGENTS.md` zuerst dateigenau mit `pnpm test:focused -- <test-file>` ausgeführt. Provider werden in allen Tests gefakt; kein Task autorisiert Veröffentlichung oder bezahlte Aufrufe.

## Phase A – Grundlagen

### T01 – Pakete und Math-Konfiguration anlegen

- Abhängigkeiten: keine.
- Erwartete Dateien: neu `packages/math-education/{package.json,tsconfig.json,src/index.ts}`, `packages/math-rendering/{package.json,tsconfig.json,src/index.ts}`; Änderung `apps/cli/package.json`, `packages/config/src/index.ts`.
- Umsetzung: Workspace-Pakete registrieren; `MathRuntimeConfig` mit separatem Workspace, Brand-Konfigurationspfad und Featureflags einführen. Bestehende Runtime-Defaults unverändert lassen.
- Akzeptanz: beide Pakete sind filterbar/typecheckbar; ohne Math-Umgebungsvariablen verhalten sich alle bestehenden Befehle identisch; Math-Workspace defaultet nur innerhalb des Math-CLI auf `./math-episodes`.
- Tests: neue `packages/config/src/math-config.unit.test.ts`; vorhandene `packages/config/src/index.unit.test.ts`; Paket-Typechecks.
- Migration: additive Konfigurationsfelder, keine DB-/Dateimigration.
- Rollback: neue Pakete/Exports und CLI-Abhängigkeiten entfernen; bestehendes Config-Schema bleibt binär identisch.

### T02 – Math-Domäne, IDs und strikte Schemas

- Abhängigkeiten: T01.
- Erwartete Dateien: neu `packages/math-education/src/domain/{identity,curriculum,lesson,math-ast,artifacts,quality}.ts` und `domain/index.ts`.
- Umsetzung: Zod-Schemas und TypeScript-Typen für Releases, Quellen, Skills, Overrides, Varianten, Fact-IDs, AST/ExactValue, Artefaktlineage und Quality-Status implementieren.
- Akzeptanz: unbekannte Felder werden abgewiesen; ID-Formate und Grade/Sprachen/Varianten sind exakt begrenzt; Dezimal-/Rationalwerte akzeptieren keine Floats oder Nenner null.
- Tests: `packages/math-education/src/domain/domain-schemas.unit.test.ts` mit Valid-/Invalid-/Roundtrip-Fällen.
- Migration: neue Schemas `v1`; keine bestehenden Domain-Enums erweitern.
- Rollback: Paketinterne Exports entfernen; keine Altartefakte betroffen.

### T03 – Math-Workspace-Pfade und atomarer Artefaktspeicher

- Abhängigkeiten: T02.
- Erwartete Dateien: neu `packages/math-education/src/orchestration/{math-workspace-paths,artifact-store}.ts`.
- Umsetzung: containment-geprüften `MathWorkspacePathResolver`, atomare JSON/Binary-Writes, Hash-/Lineage-Validierung und Quarantäne für korrupte Manifeste implementieren; Shared-I/O-Helfer verwenden.
- Akzeptanz: alle Pfade liegen unter dem Math-Workspace; Traversal wird abgewiesen; ein fehlgeschlagener Write ersetzt kein valides Artefakt; korrupte Manifeste werden nicht als Cache-Hit verwendet.
- Tests: `math-workspace-paths.unit.test.ts`, `artifact-store.unit.test.ts` in temporären Verzeichnissen.
- Migration: neuer, getrennter Runtime-Root; `createEpisodePathResolver` unverändert.
- Rollback: Math-Workspace löschen/archivieren; Horror-Workspace unberührt.

## Phase B – Curriculum und Graph

### T04 – Versioniertes Quellenregister

- Abhängigkeiten: T02.
- Erwartete Dateien: neu `packages/math-education/data/curriculum/v1/{release.json,source-registry.json}` und `src/curriculum/source-registry.ts`.
- Umsetzung: die in `docs/mathe/sources/` dokumentierten KMK-/Länderquellen erfassen, Status/Kohorten modellieren und Release-Hashes berechnen. SH-Phasen und Saarland-9/10-Unvollständigkeit ausdrücklich speichern.
- Akzeptanz: jede Source-ID ist eindeutig; URL, Version, Abrufdatum und Status sind vorhanden; `current` ohne dokumentierte Prüfung oder landesrechtliche Claims ohne Mapping werden abgewiesen.
- Tests: `source-registry.unit.test.ts` plus Schema-Validierung der echten Registry-Datei.
- Migration: initialer Release `de-gems-5-10-v1`; spätere Releases append-only.
- Rollback: Release auf `draft` halten oder `superseded` markieren; veröffentlichte Registry nie überschreiben.

### T05 – Curriculum-Seed importieren und normalisieren

- Abhängigkeiten: T02, T04.
- Erwartete Dateien: neu `src/curriculum/{markdown-seed-reader,importer,validator}.ts`, `data/curriculum/v1/skills.json`.
- Umsetzung: exakt einen `json`-Codeblock aus `03-machine-readable-seed.md` lesen, Schema v1 strikt prüfen, 206 Skills normalisieren und einen deterministischen Release-Hash erzeugen.
- Akzeptanz: Counts sind Klasse 5–10 = 37/34/36/36/33/30; alle Skills haben 180/240/300 Sekunden und drei Varianten; unbekannte Felder, doppelte IDs oder Markdown-Mehrdeutigkeit blockieren.
- Tests: `curriculum-importer.unit.test.ts` gegen echten Seed und kleine Fehlerfixtures.
- Migration: Markdown bleibt Eingabe; normalisierte JSON-Datei wird nur nach Review aktualisiert.
- Rollback: letzten veröffentlichten JSON-Release pinnen; fehlerhaften Draft verwerfen.

### T06 – Länder-Overrides und Provenienz-Gate

- Abhängigkeiten: T04, T05.
- Erwartete Dateien: neu `data/curriculum/v1/state-overrides.json`, `src/curriculum/{state-overrides,provenance-gate}.ts`.
- Umsetzung: schlanke Platzierungs-Overrides und Source-Mappings modellieren; keine Skillkopien erzeugen.
- Akzeptanz: Overrides können nur erlaubte Platzierungsfelder ändern; ungültige Zeiträume/Kohorten und verwaiste Source-IDs blockieren; unvollständige Provenienz verhindert Rechtsverbindlichkeitsclaims und Publish.
- Tests: `state-overrides.unit.test.ts`, `provenance-gate.unit.test.ts`.
- Migration: keine bestehende Datenmigration; neue Overrides werden releasegebunden.
- Rollback: einzelne Override-Version deaktivieren und vorherigen Release pinnen.

### T07 – Voraussetzungskandidaten, Review und DAG

- Abhängigkeiten: T05, T06.
- Erwartete Dateien: neu `data/curriculum/v1/prerequisites.json`, `src/curriculum/{prerequisite-generator,dag-validator,topological-order}.ts`.
- Umsetzung: Kandidaten mit Begründung erzeugen, Reviewstatus speichern und stabile topologische Reihenfolge berechnen.
- Akzeptanz: keine unbekannten IDs, Selbstkanten, Duplikate oder Zyklen; jede Kante reviewed; Tie-Breaker sind deterministisch; künftige-Klasse-Ausnahmen brauchen Approval.
- Tests: `prerequisite-dag.unit.test.ts` einschließlich Cycle-/Diamond-/Cross-Grade-Fixtures.
- Migration: Graph ist Bestandteil des Curriculum-Releases; Playlistreihenfolge ändert sich erst mit neuem Release.
- Rollback: letzten reviewten Graph-Hash reaktivieren.

### T08 – Curriculum-CLI

- Abhängigkeiten: T05–T07.
- Erwartete Dateien: neu `apps/cli/src/math-commands.ts`, `apps/cli/src/math-curriculum-commands.ts`; Änderung `apps/cli/src/index.ts`.
- Umsetzung: `math curriculum import|validate|graph` registrieren; `--dry-run` ist read-only und JSON-Ausgabe stabil.
- Akzeptanz: Help funktioniert ohne Math-Konfiguration; Import-Dry-Run schreibt nichts; Fehler enthalten Source-/Skill-ID und Exitcode 1.
- Tests: `apps/cli/src/math-curriculum-commands.unit.test.ts`, Ergänzung `apps/cli/src/index.unit.test.ts`.
- Migration: additive Top-Level-CLI; keine bestehenden Befehlsnamen ändern.
- Rollback: nur `registerMathCommands` entfernen.

## Phase C – Lesson-Spezifikation und Verifikation

### T09 – Varianten- und Lesson-Spezifikation

- Abhängigkeiten: T02, T07.
- Erwartete Dateien: neu `src/lesson/{variant-builder,lesson-validator,process-competency}.ts`.
- Umsetzung: gemeinsames SkillObjective und drei eigenständige Varianten mit Beispielen, Fehler, Denkaufgabe/Lösung und sichtbarer Prozesskompetenz modellieren.
- Akzeptanz: exakt ein Lernziel; Varianten teilen Ziel/Skillgrenze, unterscheiden sich aber semantisch in Scaffolding/Transfer; jede Aufgabe besitzt vollständige Lösung.
- Tests: `lesson-variant.unit.test.ts` mit positiven und Near-Duplicate-Fällen.
- Migration: neue Lesson-IDs folgen der festgelegten Policy.
- Rollback: betroffene Lesson-Spec auf vorherigen Hash zurücksetzen.

### T10 – AST, Einheiten und kanonische Darstellung

- Abhängigkeiten: T02.
- Erwartete Dateien: neu `src/verification/{ast-normalizer,exact-values,units,canonical-json,latex-formatter}.ts`.
- Umsetzung: AST normalisieren, exakte Dezimal-/Rationalwerte und Dimensionsvektoren implementieren, deterministisches JSON/LaTeX erzeugen.
- Akzeptanz: semantisch gleiche kommutative Ausdrücke hashen gleich; Darstellung verändert Semantik nicht; Grad/Radiant und Approximationen sind explizit.
- Tests: `math-ast.unit.test.ts`, property-basierte Roundtrips mit festem Seed.
- Migration: AST `math-ast.v1`; Breaking Changes benötigen Konverter und neue Major-Version.
- Rollback: v1-Reader/Writer weiter pinnen.

### T11 – Python-SymPy-Protokoll und Worker

- Abhängigkeiten: T10.
- Erwartete Dateien: neu `python/math-verifier/pyproject.toml`, `src/math_verifier/{protocol,ast,checks,worker}.py`, `tests/`.
- Umsetzung: gepinnten Offline-Worker für Evaluate, Equivalent, Solve, Units, Graphpunkte, Geometrie und Wahrscheinlichkeit implementieren.
- Akzeptanz: genau ein JSON-Response; Hash-/Versionsecho; deterministische Resultate; unbekannte Checks = `unsupported`; Netzwerk ist nicht erforderlich.
- Tests: Python-Unit-/Protocol-Goldens und Fehlerfixtures; keine Provider.
- Migration: Protokoll `math-verifier.v1`; Worker- und SymPy-Version im Resultat.
- Rollback: vorherigen Worker/Lockfile pinnen; inkompatible Resultate werden nicht gelesen.

### T12 – TypeScript-Verifier-Adapter

- Abhängigkeiten: T10, T11.
- Erwartete Dateien: neu `src/verification/{sympy-adapter,protocol-schemas,verification-service}.ts`.
- Umsetzung: festen Workerpfad mit `stdin`, Timeout, Outputlimit und gehärteter Umgebung starten; Telemetrie und Debugreport schreiben.
- Akzeptanz: Protokoll-/Hash-/Request-ID-Mismatch, stderr-only-Diagnostikverletzung, Timeout, `failed`, `unsupported` und `error` blockieren; kein allgemeines Python-Allowlisting.
- Tests: `sympy-adapter.unit.test.ts` mit Fake-Prozessen; `sympy-adapter.integration.test.ts` gegen echten Worker.
- Migration: additiv; `packages/process-runner` bleibt unverändert.
- Rollback: Math-Verifikation deaktivieren bedeutet Publish deaktivieren; kein unsicherer Fallback.

### T13 – Math-Spec- und Display-Fact-Gate

- Abhängigkeiten: T09, T12.
- Erwartete Dateien: neu `src/verification/{math-spec-builder,fact-coverage-gate}.ts`.
- Umsetzung: alle Schritte, Lösungen, Graphpunkte und Visualwerte mit `factId` und Checks verbinden; Coverage-Report erzeugen.
- Akzeptanz: jeder sichtbare Fakt hat genau eine kanonische Semantik und mindestens einen bestandenen Check; verwaiste/ungetestete Fakten blockieren.
- Tests: `fact-coverage-gate.unit.test.ts`; repräsentative Fixtures für Arithmetik, Geometrie, Daten.
- Migration: neue Artefakte; keine Altproduktion betroffen.
- Rollback: Lesson auf letzten vollständig verifizierten Spec-Hash pinnen.

## Phase D – Sprache, Visuals und Audio

### T14 – Math-Promptregistry und kanonische deutsche Narration

- Abhängigkeiten: T09, T13.
- Erwartete Dateien: neu `src/prompts/{registry,compiler,modules}.ts`, `src/lesson/canonical-narration.ts`.
- Umsetzung: math-eigene, versionierte Promptmodule mit Shared-Promptcache/Debuglogging; Fact-Tokens statt eingebetteter Werte.
- Akzeptanz: keine Story-/Horror-Module importiert; Promptfingerprint enthält Modul-/Schema-/Spec-Version; Dry Run dispatcht nicht.
- Tests: `math-prompt-registry.unit.test.ts`, `canonical-narration.unit.test.ts` mit Fake-Client.
- Migration: keine bestehende Promptregistry ändern.
- Rollback: Promptversion pinnen; generierte Drafts mit anderem Hash nicht wiederverwenden.

### T15 – Glossare und Locked-Fact-Lokalisierung

- Abhängigkeiten: T14.
- Erwartete Dateien: neu `data/glossaries/v1/{de,en,es,fr,pt}.json`, `src/localization/{fact-lock,localizer,locale-formatter,glossary}.ts`.
- Umsetzung: Concept-IDs, Fachbegriffe, Zahlformate, TTS-Aussprache und Fact-Token-Roundtrip implementieren.
- Akzeptanz: Scene-/Fact-Reihenfolge und AST-Hashes bleiben identisch; verlorene/duplizierte Tokens, False Friends oder Glossarverstöße blockieren; Deutsch durchläuft dieselbe Lock-Prüfung.
- Tests: `fact-lock.unit.test.ts`, `localization.unit.test.ts` je Sprache und Leakage-/Format-Fixtures.
- Migration: Glossarversion Teil jedes Locale-Fingerprints.
- Rollback: vorherige Glossar-/Promptversion pinnen; betroffene Locale-Artefakte stale setzen.

### T16 – Szenen- und Timingmodell

- Abhängigkeiten: T14, T15.
- Erwartete Dateien: neu `src/lesson/{scene-plan,timing-plan,timing-reflow}.ts`.
- Umsetzung: neun Produktbeats, gesperrte Szenenfunktionen, Segment-/Cue-Referenzen und Audio-basierten Frame-Reflow modellieren.
- Akzeptanz: monotone, lückenfreie Timeline; 180–300 Sekunden; Denkpause/Lösung vorhanden; keine Cue außerhalb der Szene.
- Tests: `scene-timing.unit.test.ts` mit langsamen/schnellen Locale-Audios und Grenzdauern.
- Migration: Timing `v1`; Audioänderung invalidiert Timing/Render, nicht Mathematik.
- Rollback: letztes Audio-/Timing-Paar gemeinsam reaktivieren.

### T17 – Lehrer-Assetvertrag

- Abhängigkeiten: T01.
- Erwartete Dateien: neu `assets/math-teacher/alex/v1/manifest.json`, sieben reviewte Bildassets, `packages/math-rendering/src/assets/teacher.ts`.
- Umsetzung: Pose-IDs, Hashes, Provenienz/Lizenz, Abmessungen und Safe Areas erfassen; keine Laufzeitgenerierung.
- Akzeptanz: alle sieben Posen vorhanden/hashvalide; Manifest erlaubt maximal 25-Prozent-Fläche; fehlende Lizenz/Provenienz blockiert.
- Tests: `teacher-assets.unit.test.ts` plus Pfad-/Bilddimensionsprüfung.
- Migration: Assetversion im Renderfingerprint.
- Rollback: auf vorheriges vollständiges Assetmanifest pinnen.

### T18 – Formel-/Diagramm-Komponenten und Profile

- Abhängigkeiten: T10, T13, T17.
- Erwartete Dateien: neu `packages/math-rendering/src/components/*.tsx`, `profiles/{grades-5-7,grades-8-10}.ts`, `assets/formula-cache.ts`.
- Umsetzung: typisierte V1-Komponenten, KaTeX-AST-Renderer, Safe Areas und zwei Altersprofile implementieren.
- Akzeptanz: Komponenten akzeptieren keine ungebundenen mathematischen Werte; alle Fact-IDs existieren; Profile erzwingen Größen-/Objektlimits; SVG-Ausgabe ist deterministisch.
- Tests: `components.unit.test.tsx`, `profiles.unit.test.ts`, semantische SVG-Fixtures statt Vollsnapshots.
- Migration: direkte Remotion/React/KaTeX-Abhängigkeiten nur im Rendering-Paket.
- Rollback: Komponenten-/Profilversion pinnen; Cache nach Version separieren.

### T19 – Math-TTS-Adapter und Audio-QA

- Abhängigkeiten: T15, T16.
- Erwartete Dateien: neu `src/orchestration/tts-stage.ts`; kleine additive Exports in `packages/speech/src/index.ts` nur falls benötigt.
- Umsetzung: vorhandenen `SpeechProvider`, Mock, Cache, Mastering und Audio-Validator pro Narrationssegment ansteuern; math-eigenes Pfad-/Variantmodell verwenden.
- Akzeptanz: Resume ist request-fingerprintbasiert; Mock erzeugt deterministische Dauer; echte Provider nur mit Flag; TTS-Lexikon ist im Fingerprint; Audiofehler bleiben itemlokal.
- Tests: `tts-stage.unit.test.ts` mit `MockSpeechProvider`; vorhandene fokussierte Speech-Tests bei additiven Exportänderungen.
- Migration: keine Änderung an `NarrationPipeline`-Defaults.
- Rollback: additive Exports entfernen; Math-Audioartefakte archivieren.

## Phase E – Render, Metadaten und Publish

### T20 – Remotion-Komposition und FFmpeg-Gate

- Abhängigkeiten: T16, T18, T19.
- Erwartete Dateien: neu `packages/math-rendering/src/composition/{Root,MathLesson,Scene}.tsx`, `render-math-lesson.ts`; `package.json`-Abhängigkeiten.
- Umsetzung: 1920×1080/30fps-Komposition aus Timingmanifest bauen; lokal rendern; `validateRenderedVideo` für Codec, Pixel, Audio und Dauer verwenden.
- Akzeptanz: Framezahl folgt Timing exakt; reproduzierbarer Renderfingerprint; 16:9/Safe-Area/Audio-QA bestanden; kein Manim in V1.
- Tests: `math-composition.unit.test.tsx`; kleine lokale `math-render.integration.test.ts` mit Mock-Audio/Assets.
- Migration: neues Rendering-Paket; bestehender `FFmpegVideoRenderer` bleibt unverändert.
- Rollback: Remotion-Stage featureflaggen; kein Fallback auf unverifizierte Story-Renderer.

### T21 – Math-Metadaten, Thumbnail und Playlistkatalog

- Abhängigkeiten: T07, T15, T16, T18.
- Erwartete Dateien: neu `src/metadata/{schema,generator,playlist-catalog}.ts`, `packages/math-rendering/src/thumbnail/math-thumbnail.tsx`.
- Umsetzung: deterministische/optional providerunterstützte lokalisierte Metadaten, DAG-Navigation, drei Pflichtplaylistarten und deterministisches Thumbnail erzeugen.
- Akzeptanz: Titel ≤100, Beschreibung/Kapitel vollständig, Thumbnailtext 2–5 Wörter, mindestens Klasse/Thema/Variante, alle Keys im Brandkatalog.
- Tests: `math-metadata.unit.test.ts`, `playlist-catalog.unit.test.ts`, `math-thumbnail.unit.test.tsx`.
- Migration: Horror-Metadataschema und -prompt unverändert.
- Rollback: Math-Metadatenversion pinnen; Publish bleibt blockiert, wenn Katalog fehlt.

### T22 – Generischer YouTube-Publish-Core und Mehrfachplaylists

- Abhängigkeiten: T21.
- Erwartete Dateien: neu/umgebaut `packages/youtube-upload/src/publish-youtube-media.ts`; additive Änderungen `packages/youtube-upload/src/index.ts`.
- Umsetzung: `publishYoutubeMedia` mit expliziten Inputs/Channel/`playlistIds[]`; `uploadYoutubeEpisode` als kompatiblen Wrapper erhalten; idempotente Playlistzuweisung.
- Akzeptanz: altes `playlistId` verhält sich identisch; mehrere Playlistfehler werden einzeln berichtet; Channel-Mismatch und fehlende Brandpolicy blockieren; Fake-Client zeigt keine doppelten Inserts.
- Tests: neue `publish-youtube-media.unit.test.ts`; vorhandene `packages/youtube-upload/src/index.unit.test.ts`.
- Migration: additive API; alte Reports bleiben lesbar, neue Reports versioniert.
- Rollback: Legacy-Wrapper auf bisherigen Pfad zurückschalten; Math-Publish deaktivieren.

### T23 – Quality-Statusmaschine und Approval

- Abhängigkeiten: T06, T07, T13, T15, T16, T20–T22.
- Erwartete Dateien: neu `src/orchestration/{quality-gate,quality-approval}.ts`.
- Umsetzung: Einzelchecks aggregieren, feste Fehlerpriorität und Vier-Augen-Approval für Minor Edits implementieren.
- Akzeptanz: `MATHEMATICAL_ERROR`/`unsupported` nie überschreibbar; nur `READY` oder approved Minor Edits publishbar; Status wird abgeleitet, nicht frei gesetzt.
- Tests: `quality-gate.unit.test.ts` mit jeder Prioritätskombination und Approval-Manipulationen.
- Migration: neue Quality-Artefakte v1.
- Rollback: Publish-Gate fail-closed; vorherigen Gate-Producer pinnen.

## Phase F – Orchestrierung und Rollout

### T24 – Stage-Manifest, Resume und Invalidierung

- Abhängigkeiten: T03, T23.
- Erwartete Dateien: neu `src/orchestration/{stage-types,workflow-manifest,workflow-store,invalidation}.ts`.
- Umsetzung: Math-Stage-DAG, Fingerprints, Locking, Cachezustände und `--force-stage` implementieren.
- Akzeptanz: identischer Re-Run schreibt nichts neu; Elternänderung invalidiert nur Nachfolger; korrupte/stale Outputs werden nie reused; Fehlerhistorie bleibt erhalten.
- Tests: `workflow-store.unit.test.ts`, `workflow-invalidation.unit.test.ts`.
- Migration: dateibasiert, keine SQLite-Migration.
- Rollback: Manifest-Reader auf v1 pinnen; neuere Manifeste quarantänisieren.

### T25 – Isolierter Batch-Scheduler

- Abhängigkeiten: T24.
- Erwartete Dateien: neu `src/orchestration/{batch-planner,batch-runner,batch-report}.ts`.
- Umsetzung: Items `(lessonId, language)`, Dependency-Blocking, Retrybudgets, `partial`-Status und Resume implementieren.
- Akzeptanz: ein Locale-/Lessonfehler stoppt unabhängige Items nicht; nur transitive Abhängige werden blocked; Erfolge bleiben persistent; Exitcode 2 für partial.
- Tests: `batch-runner.unit.test.ts` mit gemischten Erfolgs-, Retry-, Block- und Resume-Fällen.
- Migration: keine Story-Batchtypen erweitern; gemeinsamer Provider-Port nur additiv.
- Rollback: Batchfeature deaktivieren; Einzel-Lesson-Runner bleibt nutzbar.

### T26 – Production-CLI, Dry Run, Simulation und Telemetrie

- Abhängigkeiten: T08, T19–T25.
- Erwartete Dateien: neu `apps/cli/src/math-production-commands.ts`; Änderung `apps/cli/src/math-commands.ts`, additive Math-Kontextfelder in `packages/observability` falls erforderlich.
- Umsetzung: `production plan|run|resume|status|inspect`, `verify`, `quality`, `publish`; Selektoren, Flags und Exitcodes verdrahten.
- Akzeptanz: Defaultselektion nur Math = Klasse 5/standard/de; Dry Run hat null Writes/Prozesse/Provider; Simulation arbeitet nur im expliziten Workspace und meldet `paidProviderCalled=false`; Paid/Publish benötigen doppelte Freigabe.
- Tests: `math-production-commands.unit.test.ts`, `math-simulation.integration.test.ts`, vorhandene CLI-Help-Tests.
- Migration: additive Befehle; globale Root-Optionen unverändert.
- Rollback: `registerMathCommands` featureflaggen/entfernen; gespeicherte Artefakte erhalten.

### T27 – Klasse-5-Standard-Golden-Path

- Abhängigkeiten: T26.
- Erwartete Dateien: neue kleine Fixtures unter `packages/math-education/src/__fixtures__/pilot/` und `packages/math-rendering/src/__fixtures__/pilot/`.
- Umsetzung: `M5-ZO-001-standard-de` vollständig simulieren; danach private Kandidaten aus Zahl/Operation, Geometrie und Daten vorbereiten.
- Akzeptanz: alle Stages cached/resumierbar, Verifier/Lock/Timing/Render/Metadata/Playlists/Quality grün; keine Providerkosten im Simulationslauf.
- Tests: `math-pilot.e2e.test.ts`; exakter CLI-Simulationsbefehl im Report.
- Migration: keine öffentliche Publikation; private Artefakte releasegepinnt.
- Rollback: Pilotfeature deaktivieren und Workspace archivieren.

### T28 – Horror-Kompatibilität und gestufter Rollout

- Abhängigkeiten: T27.
- Erwartete Dateien: nur fokussierte Charakterisierungstests in betroffenen bestehenden Paketen; Rolloutkonfiguration im Math-Paket.
- Umsetzung: importgraphisch sicherstellen, dass Story/Dark-Truth nicht von Math abhängen; 37 deutsche Klasse-5-Standard-Lessons privat batchen; danach kontrollierte Sprach-/Varianten-/Klassenfreigaben.
- Akzeptanz: bestehende Story-CLI-Hilfe, Config-, Speech-, Upload- und Thumbnail-Charakterisierungstests grün; keine Horror-Defaults geändert; Rollbackflag stoppt Math-Dispatch/Publish sofort.
- Tests: betroffene vorhandene Unit-Dateien plus `math-rollout-gate.unit.test.ts`; keine Repo-weiten Runs ohne Freigabe.
- Migration: nur explizite Math-Release-Pointer; publizierte Videos behalten alte Release-IDs.
- Rollback: Featureflag aus, aktuelle Math-Release-ID zurücksetzen, laufende Provider-Batches kontrolliert stornieren, keine automatische Video-Löschung.
