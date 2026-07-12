# Fehlerresilienz und Observability

## Pipeline-Eigenschaften

- idempotente Stages
- atomare Writes
- Content-Hashes
- Resume auf Artefakt- und Lesson-Ebene
- unabhängige Verarbeitung von Batch-Einträgen
- Retry-Budget je Provider und Stage
- persistierte Fehlerhistorie
- blockierende Publish-Gates ohne Verlust erfolgreicher Teilresultate
- Simulation ohne bezahlte Provider-Aufrufe

## Logs

Jeder OpenAI-, TTS-, Rendering- und Publishing-Aufruf erhält:

- correlation ID
- curriculum skill ID
- lesson variant ID
- language
- stage
- provider/model/version
- Dauer, Retry-Zahl und Token-/Kostenmetrik
- Request und Response im Debug-Verzeichnis
- keine Base64-Bilddaten

## Metriken

- Erfolgs- und Fehlerrate je Stage
- mathematische Gate-Fehler je Skill
- Renderdauer und Asset-Cache-Treffer
- TTS-Dauer und Synchronitätsabweichung
- tatsächliche Videolänge
- Kosten pro fertigem Video
