# Implementierungsplan: Mathematik-Genre

Status: entscheidungsreifer Plan, keine Produktionsimplementierung  
Rollout-Schnitt: Deutsch, Klasse 5, Variante `standard`  
Zielkanäle: `de`, `en`, `es`, `fr`, `pt`

Phase eins umfasst ausschließlich 3–5-minütige 16:9-Lernvideos mit integrierter Denkaufgabe und Lösung. Separate Quizformate, Arbeitsblätter, Downloads, Shorts und Hochkantvarianten sind ausdrücklich außerhalb des Scopes.

## 1. Repository-Befund und Architekturentscheidung

Das Repository ist ein striktes Node-22-/TypeScript-5.9-/pnpm-Monorepo. `apps/cli` ist die operative Oberfläche; Vitest trennt Unit-, Integration- und E2E-Tests. Folgende vorhandene Bausteine werden weiterverwendet:

| Bereich | Verifizierte Implementierung | Entscheidung |
|---|---|---|
| Pfade, Hashes, atomare Writes | `packages/shared/src/episode-filesystem.ts`, `packages/shared/src/index.ts` | Hash-/I/O-Helfer wiederverwenden; einen eigenen `MathWorkspacePathResolver` neben dem auf `full`/`short` festgelegten Episode-Resolver einführen. |
| Prompt-Cache und Debug | `planPromptCache` in `packages/shared/src/prompt-cache.ts`, `writeOpenAIDebugLog` in `packages/shared/src/openai-debug-logger.ts` | Direkt wiederverwenden; mathematische Prompts erhalten eigene Versionen und Fingerprints. |
| Workflow-Muster | `story-workflow.types.ts`, `story-workflow-store.ts`, `story-workflow-batch.ts` | Status-, Fingerprint-, Lock- und atomare Manifestmuster übernehmen, nicht die story-spezifischen Typen oder Stage-Listen importieren. |
| TTS und Audio | `SpeechProvider`, `MockSpeechProvider`, `OpenAiCompatibleSpeechProvider` sowie Cache-, Mastering- und Audio-Validierung in `packages/speech/src` | Provider und niedrige Audio-Bausteine wiederverwenden. `NarrationPipeline` nicht direkt nutzen, da Pfade, Varianten und `validateSpokenNarrationText` story-spezifisch sind. |
| Bilder/Batches | Provider-Port in `packages/image-generation/src/image-batch-provider.ts`, Batch-/Resume-Muster in `image-batch-service.ts` | Nur Provider-/Cache-Muster für optionale Assets nutzen. Formeln, Diagramme, Lehrerfigur und Phase-1-Thumbnails deterministisch erzeugen; keine generativen Szenenbilder voraussetzen. |
| Rendering | `validateRenderedVideo` und FFmpeg-Helfer in `packages/rendering/src/index.ts` | Remotion neu als Kompositor einführen; vorhandene FFmpeg-Validierung und Telemetrie anschließen. |
| Metadaten/Upload | `youtubeMetadataSchema` in `packages/metadata`, `uploadYoutubeEpisode` in `packages/youtube-upload` | Generischen YouTube-Publish-Core aus dem Episode-Wrapper extrahieren; Horror-Metadatenprompt nicht verwenden. Mehrfach-Playlist-Zuweisung abwärtskompatibel ergänzen. |
| Beobachtbarkeit | `createExecutionTelemetry`, Pricing-Katalog und Pino-Logger in `packages/observability` | Um Math-Kontextfelder und Stage-Metriken erweitern, bestehende Reportstruktur erhalten. |

Harte Kopplungen, die nicht in die Mathematik-Pipeline gelangen dürfen:

- Story-Genres, übernatürliche Regeln und Horror-Policies in `packages/story-localization/src/story-artifact-model.ts`, `genre-policy.ts` und `story-prompt-module-registry.ts`.
- Globale Varianten `full`/`short` und Story-Stage-Typen in `story-workflow.types.ts` sowie `packages/shared/src/episode-filesystem.ts`.
- Horror-Thumbnail-Typen und Defaults (`click-optimized-horror-v3`, `viral-horror-v1`) in `packages/image-generation/src/thumbnail-contracts.ts` und `thumbnail-prompt-compiler.ts`.
- Story-/Episode-Annahmen in `packages/speech/src/spoken-narration.ts`, `packages/metadata/src/youtube-metadata.ts`, `packages/rendering/src/index.ts` und `packages/youtube-upload/src/index.ts`.
- Globale Defaults `./episodes`, Story-Modelle und bestehende YouTube-Credentials in `packages/config/src/index.ts`.
- `packages/dark-truth` bleibt unverändert und darf keine Math-Abhängigkeit erhalten.

Remotion ist derzeit nicht vorhanden. KaTeX erscheint nur transitiv im Lockfile und muss für Mathematik als direkte, gepinnte Abhängigkeit deklariert werden. Die neuen Produktionsmodule werden deshalb als `packages/math-education` (Domäne und Orchestrierung) und `packages/math-rendering` (React/Remotion/SVG) angelegt. `apps/cli/src/math-commands.ts` registriert einen neuen Top-Level-Befehl `mediaforge math`.

## 2. Zielstruktur und Artefaktlayout

Neue, bei Implementierung anzulegende Pfade:

```text
packages/math-education/
  data/curriculum/v1/{release,source-registry,skills,state-overrides,prerequisites}.json
  data/glossaries/v1/{de,en,es,fr,pt}.json
  src/{domain,curriculum,lesson,verification,localization,orchestration,metadata,publishing}/
packages/math-rendering/
  src/{components,profiles,composition,assets,thumbnail}/
python/math-verifier/
  pyproject.toml
  src/math_verifier/{protocol,ast,checks,worker}.py
assets/math-teacher/alex/v1/
apps/cli/src/math-commands.ts
```

Laufzeitdaten liegen getrennt von Horror-Episoden unter dem repository-lokalen, ignorierten Math-Workspace `.cache/math-pipeline/production` (oder einem explizit gewählten privaten Workspace außerhalb des Repositorys). Das kanonische Layout ist:

```text
.cache/math-pipeline/production/<lesson-id>/
  manifest.json
  canonical/{skill,lesson-spec,math-spec,verification,narration,scene-plan}.json
  locales/<language>/{narration,lock-report,timing,audio,metadata,thumbnail,render,quality}.json
  locales/<language>/audio/{segments,narration.wav}/
  locales/<language>/render/{video.mp4,final-media-validation.json}/
  state/{stages,failures,batches,approvals}/
  debug/{provider-calls,verifier,render}/
```

Jede JSON-Datei ist strikt versioniert und enthält `artifactVersion`, `contentHash`, `createdAt`, `producer`, `producerVersion` und `parentHashes`. Writes erfolgen in derselben Directory als Temp-Datei mit anschließendem Rename. Ein Stage-Erfolg wird erst nach Schema-, Hash- und fachlicher Validierung atomar im Manifest vermerkt.

## 3. Curriculum, Quellen und IDs

### Quellenregister und Releases

`CurriculumSource` erhält `id`, `jurisdiction`, `schoolType`, `title`, `documentVersion`, `effectiveFrom`, optional `effectiveTo` und `cohort`, `status`, `officialUrls`, `retrievedAt`, optional `contentHash` sowie `notes`. Schleswig-Holstein wird kohortenbezogen als `phasing_in`/`phasing_out` abgebildet; Saarland 9/10 bleibt `unverified`, bis die Anschlusspläne redaktionell bestätigt sind.

Ein `CurriculumRelease` bindet `releaseId` (Start: `de-gems-5-10-v1`), `schemaVersion`, semantische `curriculumVersion`, Registry-Version, Hashes aller Inputs, Freigabestatus (`draft | reviewed | published | superseded`) und `supersededBy`. Veröffentlichte Releases sind unveränderlich. Die Markdown-Seed-Datei wird nur beim Import gelesen; der normalisierte, reviewbare JSON-Release ist danach die Produktionsquelle.

### Normalisiertes Skill-Schema und Overrides

`CurriculumSkill` enthält:

- stabile `skillId`, `canonicalGrade` 5–10, Leitidee, Topic, genau ein beobachtbares Lernziel und `placementConfidence`;
- mindestens eine sichtbare Prozesskompetenz aus `ARG | PROB | MOD | REP | OBJ | COM | MED` mit geplanter Szene;
- `sourceMappings` mit Quelle, Abschnitt/Seite, Abdeckungsart und Reviewstatus;
- `duration` 180/240/300 Sekunden, erlaubte Varianten und redaktionellen Status;
- `prerequisiteIds`, `stateOverrides` und Migrationsmetadaten.

Ein `StatePlacementOverride` referenziert Skill und Quellen-Mapping und darf nur `grade`, `gradeBand`, landesspezifisches Niveau, Kohorte, Verbindlichkeit, Gültigkeit und Kommentar überschreiben. Lernziel und Mathematik werden nicht dupliziert. Unbekannte Felder, fehlende Provenienz oder nicht verifizierte Rechtsverbindlichkeitsbehauptungen blockieren den Release.

### ID- und Migrationspolitik

- `skillId` bleibt im vorhandenen Format, etwa `M5-ZO-001`, und wird nach erster Veröffentlichung nie neu verwendet.
- `lessonId` ist `<skillId>-<variant>` in Kleinbuchstaben, z. B. `m5-zo-001-standard`; `localizedLessonId` ergänzt `-<language>`.
- Redaktionelle Textkorrekturen ohne Semantikänderung erhöhen nur Artefakt-/Curriculum-Versionen. Eine Änderung des Lernziels erzeugt eine neue Skill-ID und eine `replaces`/`replacedBy`-Migration.
- Zusammenlegung, Aufteilung und Verschiebung werden in einer append-only Migrationstabelle mit `effectiveRelease`, Grund und Alias für Lesezugriffe dokumentiert. Aliase dürfen nie neue Artefakte schreiben.
- Veröffentlichte Videos behalten ihren ursprünglichen Release- und Skill-Verweis; Rebuilds gegen neue Releases sind explizite Migrationen.

### Voraussetzungengraph

Der Importer erzeugt zunächst Kandidaten aus expliziten redaktionellen Kanten, spiralcurricularen Reihenfolgen und fachlich sicheren Regeln. Jede Kante besitzt `from`, `to`, `kind` (`required | recommended`), Begründung, Quelle/Editor und Reviewstatus. Nur `required` bestimmt Produktionsblocker; beide Kanten bestimmen Playlistvorschläge.

Vor Freigabe werden Referenzen, Selbstkanten, Duplikate und Zyklen geprüft. Die finale Reihenfolge ist eine stabile topologische Sortierung mit Tie-Breakern `canonicalGrade`, redaktionelle Seed-Reihenfolge, `skillId`. Jede Kante muss akzeptiert oder begründet verworfen sein. Cross-Grade-Kanten sind erlaubt; Kanten in eine höhere Klasse als Voraussetzung einer niedrigeren benötigen explizite Ausnahmefreigabe.

## 4. Lesson- und Mathematikmodell

`SkillSpecification` hält das gemeinsame Lernziel. Davon werden drei `LessonVariantSpecification`-Entitäten abgeleitet. Sie teilen Lernziel und Kompetenzgrenze, unterscheiden sich aber in Scaffolding, Zahlmaterial, Abstraktion, Tempo, Begründungstiefe und Transfer. Jede Variante enthält Promise, Zielgruppe, Prozesskompetenz-Beobachtung, vollständige Beispiele, typischen Fehler, Schüleraufgabe mit Denkpause und vollständige Lösung. Ein bloßer Zahlen- oder Texttausch zwischen Varianten ist ein Quality-Fehler.

Die exakte Mathematik wird sprachunabhängig gespeichert:

```ts
type ExpressionNode =
  | { kind: 'integer'; value: string }
  | { kind: 'rational'; numerator: string; denominator: string }
  | { kind: 'decimal'; unscaled: string; scale: number }
  | { kind: 'constant'; name: 'pi' | 'e' }
  | { kind: 'symbol'; name: string; assumptions?: string[] }
  | { kind: 'negate'; operand: ExpressionNode }
  | { kind: 'sum' | 'product'; operands: ExpressionNode[] }
  | { kind: 'quotient' | 'power'; left: ExpressionNode; right: ExpressionNode }
  | { kind: 'root'; radicand: ExpressionNode; degree: ExpressionNode }
  | { kind: 'function'; name: 'abs' | 'sin' | 'cos' | 'tan' | 'log'; args: ExpressionNode[] }
  | { kind: 'relation'; operator: 'eq' | 'lt' | 'lte' | 'gt' | 'gte'; left: ExpressionNode; right: ExpressionNode }
  | { kind: 'tuple' | 'set' | 'matrix'; items: ExpressionNode[] };

type ExactValue =
  | { kind: 'scalar'; expression: ExpressionNode }
  | { kind: 'measurement'; value: ExpressionNode; unit: UnitExpression }
  | { kind: 'finite-set' | 'tuple'; values: ExactValue[] }
  | { kind: 'approximation'; exact: ExpressionNode; displayed: string; tolerance: ExpressionNode };
```

Strings speichern beliebig große Ganzzahlen; Dezimalzahlen sind exakte skalierte Integer, niemals JavaScript-Floats. Einheiten besitzen rationale Skalen und Dimensionsvektoren. Winkel kennzeichnen Grad/Radiant explizit. Darstellung (`latex`, lokalisierter Zahltext, Rundungsform) ist getrennt von Semantik. Jeder Rechenschritt, jede Lösung, jeder Graphpunkt und jeder im Bild sichtbare Wert trägt eine stabile `factId` und mindestens eine `VerificationCheck`-Referenz.

## 5. Unabhängiger SymPy-Verifier

Der Worker ist ein isolierter Python-Prozess ohne Netzwerk und ohne LLM. Das Protokoll `math-verifier.v1` ist ein einzelnes JSON-Dokument auf `stdin` und genau ein JSON-Dokument auf `stdout`; Diagnostik geht ausschließlich nach `stderr`.

Request-Felder: `protocolVersion`, `requestId`, `inputHash`, `mathSpecVersion`, `checks[]`. Ein Check enthält `checkId`, `kind` (`evaluate | equivalent | solve | unit-dimension | graph-point | geometry | probability | display-fact`), AST-Inputs, erwarteten exakten Wert, Annahmen und optional eine explizite Toleranz.

Response-Felder: `protocolVersion`, `requestId`, `inputHash`, `verifierVersion`, `sympyVersion`, Gesamtstatus und pro Check `passed | failed | unsupported | error`, normalisierte erwartete/tatsächliche Werte sowie maschinenlesbaren Fehlercode. TypeScript und Python berechnen denselben SHA-256 über kanonisch sortiertes JSON. Abweichende Hashes, Protokollversionen, unbekannte Nodes, Timeouts, zusätzliche stdout-Daten, `failed`, `unsupported` oder `error` blockieren die Produktion.

Der neue `SympyVerifierAdapter` startet nur den fest konfigurierten Workerpfad mit gehärteter Umgebung, Timeout und Outputlimit; er verwendet nicht die allgemeine Executable-Allowlist aus `packages/process-runner`, da dort `stdin` nicht unterstützt wird und ein allgemeines `python3`-Allowlisting zu breit wäre. Prozessmetriken werden explizit an `currentExecutionTelemetry()` gemeldet. SymPy und Python-Kompatibilität werden in `pyproject.toml`/Lockfile gepinnt.

## 6. Narration, Lokalisierung und Timing

Deutsch ist die kanonische Inhalts- und Narrationssprache. Die Narration referenziert Fakten über unveränderliche Tokens wie `[[fact:example-1-step-2]]`; konkrete Zahlen, Formeln und Einheiten werden erst durch einen deterministischen Locale-Formatter eingesetzt. Ein `FactLockManifest` bindet Lernziel-Hash, Varianten-ID, Fact-IDs, Rechenschrittreihenfolge, Lösungen, Beispielstruktur und Szenenfunktionen.

Lokalisierung darf natürliche Sprache, Fachterminologie, Aussprache, Zahlformat und kulturellen Kontext ändern, solange der mathematische Kontext äquivalent bleibt. Nach der Lokalisierung prüft der Lock-Validator:

- identische Scene-/Fact-ID-Mengen, Reihenfolge und Varianten-ID;
- unveränderte AST-/Expected-Value-Hashes;
- genaues Vorhandensein der Fact-Tokens und deterministische Ersetzung;
- Glossar- und Zahlenformatregeln für `de`, `en`, `es`, `fr`, `pt`;
- erneute Verifikation aller gerenderten Display-Facts.

Jede Sprache erhält ein versioniertes Mathematikglossar und TTS-Lexikon. Begriffe haben kanonische Concept-IDs, zulässige Formen, verbotene False Friends, Aussprache und Versionshash. Portugiesisch und Spanisch verwenden explizit konfigurierte Zielregionen; der Default folgt den vorhandenen Profilen (`pt-BR`, `es-419`), kann aber pro Brand-Konfiguration geändert werden, ohne die Mathematik zu ändern.

Die kanonische Szenenstruktur folgt den neun Produktbeats. Eine Szene enthält `sceneId`, unveränderliche `sceneFunction`, Narrationssegmente, Fact-/Asset-Referenzen, geplante Dauer und Visual-Cues. TTS wird pro Narrationssegment erzeugt. Danach berechnet ein deterministischer Timing-Reflow aus tatsächlichen Audio-Dauern Framegrenzen und Cue-Positionen; Reihenfolge und Funktion bleiben gesperrt. Remotion konsumiert nur dieses Timing-Manifest. Die Quality Gate prüft 180–300 Sekunden, monotone Frames, keine Audioüberlappung, Cue-in-Scene, Denkpause und Synchronitätstoleranzen.

## 7. Formel-, Diagramm- und Lehrerkomponenten

`packages/math-rendering` deklariert React, Remotion und KaTeX direkt. LaTeX wird aus der AST erzeugt, von KaTeX in kontrolliertes SVG/HTML überführt und zusammen mit AST-, Font- und Renderer-Version gecacht. Nutzer-/LLM-LaTeX wird nicht ungeprüft ausgeführt.

V1-Komponenten: `Formula`, `EquationSteps`, `PlaceValueChart`, `FractionModel`, `NumberLine`, `CoordinatePlane`, `FunctionGraph`, `GeometryFigure`, `MeasurementDiagram`, `DataTable`, `BarChart`, `LineChart`, `PieChart`, `BoxPlot`, `ProbabilityTree`, `FourFieldTable`, `Highlight`, `ThinkPause` und `TeacherPose`. Jede Komponente erhält typisierte Daten und Fact-IDs statt Freitextwerten.

Präsentationsprofile:

- `grades-5-7-v1`: größere Formeln/Zahlen, maximal drei aktive Hauptobjekte, konkrete Modelle, kürzere Textzeilen, stärkere Hervorhebung und häufigere Lehrerpräsenz.
- `grades-8-10-v1`: kompaktere Formeln, mehr symbolische Transformationen/Graphen, höheres Tempo, maximal fünf aktive Hauptobjekte und weniger dekorative Bewegung.

Alex wird einmal redaktionell als versioniertes, transparentes Asset-Set mit sieben Posen erstellt. `assets/math-teacher/alex/v1/manifest.json` enthält Lizenz/Provenienz, Abmessungen, Safe Area, Hash und erlaubte Pose-IDs. Keine Szene darf Alex neu generieren. Die Figur belegt maximal 25 Prozent der Bildfläche; Formel und Diagramm behalten Priorität. Fehlende oder hash-falsche Posen blockieren den Render.

## 8. Orchestrierung, Resume und Batch-Verhalten

Die Math-Stage-DAG lautet:

```text
curriculum-import -> source-validation -> prerequisite-graph -> lesson-spec
-> math-verification -> canonical-narration -> scene-timing
-> localization -> visual-assets -> tts -> timing-reflow -> render
-> metadata-playlists -> quality-gate -> publish
```

`de` durchläuft ebenfalls `localization`, jedoch als deterministische kanonische Projektion mit Lock-Prüfung. Jeder Stage-Fingerprint umfasst Elternhashes, Schema-/Prompt-/Protocol-/Glossar-/Asset-Versionen und relevante Providerkonfiguration. `--resume` verwendet nur schema- und hashvalide Artefakte; geänderte Inputs markieren genau die abhängigen Nachfolger als stale. `--force-stage` invalidiert die gewählte Stage und ihre Nachfolger, niemals Vorgänger.

Ein Batch-Item ist `(lessonId, language)`, kanonische Vorstufen sind `(lessonId, de)`. Fehler werden itemlokal persistiert. Der Scheduler verarbeitet alle Items weiter, die nicht transitiv vom Fehler abhängen; andere Sprachen desselben Lessons werden nur blockiert, wenn ein gemeinsamer kanonischer Elternschritt fehlschlägt. Retries gelten je Stage/Provider/Item mit festem Budget. Der Batch-Endstatus ist `succeeded`, `partial` oder `failed`; `partial` ist ein erwarteter, maschinenlesbarer Ausgang und löscht keine Erfolge.

CLI-Oberfläche:

```text
mediaforge math curriculum import|validate|graph
mediaforge math production plan|run|resume|status|inspect
mediaforge math verify
mediaforge math quality
mediaforge math publish
```

Selektoren sind `--skill`, `--grade`, `--variant`, `--language`, `--through-stage`. Initialdefaults gelten nur unter `math`: `--grade 5 --variant standard --language de`. Horror-Kommandos und globale Defaults bleiben unverändert.

### Simulation und Dry Run

- `--dry-run`: rein lesend; validiert Konfiguration/Inputs, plant Stages, Cacheentscheidungen, erwartete Pfade, Kosten und Blocker. Es schreibt keine Workspace-Artefakte und ruft weder Provider noch Python/FFmpeg/Remotion auf.
- `--simulate`: darf ausschließlich unter einem expliziten temporären/Ausgabe-Workspace deterministische Fixtures, Mock-TTS, Mock-Provider, SymPy und lokale Renderer verwenden. `paidProviderCalled` muss für jeden Debug-Eintrag `false` sein.
- Normalmodus: bezahlte Stages erfordern zusätzlich `--allow-paid-providers`; Publish erfordert `--publish` und eine freigegebene Quality-Artefakt-ID. Fehlende Flags blockieren vor Dispatch.

Exitcodes: `0` Ziel erreicht/planbar, `1` Eingabe oder Konfiguration ungültig, `2` Batch teilweise erfolgreich, `3` alle gewählten Items blockiert/fehlgeschlagen.

## 9. Quality, Logs und Kosten

Stage-Status (`planned | running | succeeded | failed | blocked | skipped | cached | stale`) ist vom fachlichen `MathProductionStatus` getrennt. Der Quality-Status wird bei jedem Lauf neu aus Einzelchecks abgeleitet; freie manuelle Statusmutation ist verboten. Priorität:

```text
MATHEMATICAL_ERROR > CURRICULUM_ERROR > LOCALIZATION_ERROR > TIMING_ERROR
> RENDER_BLOCKED > PUBLISH_BLOCKED > REVISION_REQUIRED
> READY_WITH_MINOR_EDITS > READY
```

Nur `READY` darf direkt publiziert werden. `READY_WITH_MINOR_EDITS` benötigt ein versioniertes Vier-Augen-Approval; alle `*_ERROR`/`*_BLOCKED`-Status bleiben blockierend. `MATHEMATICAL_ERROR` und `unsupported` sind nicht überschreibbar. Reviews fügen Eingabeartefakte hinzu und lösen das Gate neu aus.

Jeder Log-/Telemetry-Eintrag enthält `correlationId`, `batchId`, `curriculumReleaseId`, `skillId`, `lessonId`, `variant`, `language`, `stage`, Provider/Modell/Version, Versuch, Dauer, Cachezustand und Kosten. Debugdaten werden unter dem Lesson-Workspace abgelegt, Secrets und Base64 bleiben durch die vorhandene Redaction ausgeschlossen. Zusätzliche Metriken: Stage-Erfolg/Fehler, Verifier-Fehlerart, Cache-Hit, TTS-/Renderdauer, Timing-Drift, Videolänge und Kosten pro fertigem Video. Unbekannte Preise ergeben `null` plus Warnung, niemals Nullkosten.

## 10. Metadaten, Thumbnails, Playlists und Publishing

`MathPublishingMetadata` wird aus freigegebener Lesson-, Timing- und Curriculumstruktur erzeugt und enthält lokalisierte Titel/Beschreibung, Kapitel, Suchbegriffe, 2–5-Wort-Thumbnailtext, Klasse, Variante, vorherigen/nächsten DAG-Skill sowie stabile Playlist-Keys. Mindestens eine Klassen-, Themen- und Variantenplaylist ist Pflicht. Anzeigenamen sind lokalisiert; Keys bleiben sprachübergreifend stabil.

Phase-1-Thumbnails sind deterministische 16:9-Kompositionen aus großer Formel/Aufgabe, Alex-Pose, kurzem Text sowie Klassen-/Variantenindikator. Sie verwenden weder den Horror-Promptcompiler noch bezahlte Bilderzeugung. Hash, Safe Areas, Textlänge und mobile Lesbarkeit werden geprüft.

In `packages/youtube-upload` wird ein genre-neutraler `publishYoutubeMedia`-Core eingeführt. Der bestehende `uploadYoutubeEpisode`-Export bleibt als Wrapper erhalten. Die neue Eingabe akzeptiert explizite Medien-/Metadatenpfade, Content-Identität, Channel-Target und `playlistIds[]`. Das bestehende `playlistId` bleibt unterstützt und wird intern in eine einelementige Liste normalisiert. Alle geforderten Playlists werden idempotent zugewiesen; einzelne Fehler werden berichtet, und fehlende Pflichtzuweisungen ergeben `PUBLISH_BLOCKED`.

Die separate Brand erhält eigene Math-Channel-IDs und OAuth-Token je Sprache. Kein bestehendes Story-Credential wird implizit verwendet. Channel-ID-Match, Privacy, `madeForKids`, Synthetic-Media-Policy und Playlist-ID-Mapping müssen vor Publish explizit in der Brand-Konfiguration stehen. Bis zur rechtlichen/produktseitigen Freigabe bleibt Privacy `private`; ein fehlender `madeForKids`-Entscheid blockiert statt einen Wert zu raten.

## 11. Kompatibilität, Rollout und Rollback

Kompatibilitätsregeln:

- Keine Änderung an Story-Genre-Enums, `full`/`short`, Episode-Pfaden, `MEDIAFORGE_WORKSPACE`, Horror-Prompts oder `packages/dark-truth`.
- Neue Math-Abhängigkeiten zeigen nur auf genre-neutrale Pakete. Story-Pakete dürfen nicht von Math abhängen.
- Gemeinsame API-Erweiterungen sind additiv; alte Signaturen und Defaultverhalten erhalten Charakterisierungstests.
- Keine Datenbankmigration in Phase eins; Math-Manifeste sind dateibasiert. Eine spätere DB-Projektion liest diese Manifeste.

Rollout:

1. Schemas, Curriculum-Release und Graph für alle Klassen offline validieren; nur Klasse 5 zur Produktion freigeben.
2. Einen repräsentativen `M5-ZO-001-standard-de`-Golden-Path vollständig simulieren.
3. Drei Klasse-5-Standardskills aus Zahl/Operation, Geometrie und Daten als private Videos rendern und fachlich, visuell sowie akustisch reviewen.
4. Alle 37 Klasse-5-Standardskills auf Deutsch als private Batch-Produktion ausrollen; Fehler isoliert behandeln.
5. Nach Qualitäts-/Kostenfreigabe Deutsch öffentlich schalten, danach Sprachen nacheinander (`en`, `es`, `fr`, `pt`).
6. Erst danach Foundation/Challenge und Klassen 6–10 stufenweise aktivieren.

Rollback erfolgt über Brand-/CLI-Featureflag und Release-Pinning: Math-Dispatch/Publish deaktivieren, laufende Provider-Batches stornieren soweit möglich, `currentRelease` auf den letzten freigegebenen Release zurücksetzen und neue Artefakte unverändert zur Diagnose behalten. Publizierte Videos werden nicht automatisch gelöscht; Privacy-/Playlist-Korrekturen erfordern einen expliziten redaktionellen Run. Horror bleibt durch getrennte Befehle, Workspaces, Konfiguration und unveränderte Defaults betriebsfähig.

## 12. Akzeptanzkriterien des Gesamtprogramms

- Der Curriculum-Importer validiert 206 Skills (37/34/36/36/33/30), fünf Sprachen und drei Varianten mit strikten Schemas.
- Jede Produktionsrechnung und jeder sichtbare mathematische Fakt ist unabhängig verifiziert; kein `failed`, `unsupported` oder Hash-Mismatch kann publiziert werden.
- Alle Sprachen bewahren Lernziel, Fakten, Rechenschritte, Lösungen und Szenenfunktion; nur freigegebene Locale-Oberflächen variieren.
- Videos sind 1920×1080, 16:9, 180–300 Sekunden, audio-synchron und besitzen vollständige Metadaten sowie mindestens drei Playlistklassen.
- Resume ist hashbasiert und idempotent; ein Itemfehler stoppt keine unabhängigen Batch-Items.
- Dry Run ist schreib- und providerfrei; Simulation meldet null echte Provideraufrufe.
- Alle bestehenden fokussierten Horror-Charakterisierungs- und CLI-Help-Tests bleiben unverändert grün.
