export {
  renderGenreSpeechSettings,
  renderVideoSpeechSettings,
  type GenreSpeechSettingsViewModel,
  type SpeechGenerationState,
  type SpeechProfileSummary,
  type SpeechQuotaSummary,
  type SpeechViewStatus,
  type VideoSpeechGenerationViewModel,
} from "./speech-administration.js";

export function renderHomePage(): string {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>MediaForge</title></head>
  <body>
    <main>
      <h1>MediaForge</h1>
      <p>Local-first media repurposing pipeline.</p>
    </main>
  </body>
</html>`;
}
