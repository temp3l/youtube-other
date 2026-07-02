# Spoken Narration Preparation

## Objective

Create a reviewable TTS-specific narration text artifact that improves spoken delivery without overwriting the canonical localized story.

## Current Evidence

- Canonical narration is owned by `@mediaforge/story-localization`.
- `packages/story-localization/src/language-profiles.ts` already contains language-specific spoken guidance.
- `packages/speech/src/script-markdown.ts` strips Markdown directly from the canonical source before chunking.
- `packages/speech/src/audio-instructions.ts` explicitly says to preserve validated narration exactly.

## Recommended Approach

Add a separate optional artifact owned by `@mediaforge/speech`, not a modification to localization. This is safest because localization artifacts are upstream canonical story outputs and are also used by metadata, scene, and render stages.

The spoken adaptation should:

- preserve facts, names, hook, and important details;
- convert only phrasing and rhythm for spoken narration;
- record parent narration fingerprint;
- persist both Markdown and JSON metadata;
- be inspectable and manually editable;
- be optional, with deterministic pass-through fallback.

## Artifact

`spoken-text.json`:

```ts
interface SpokenNarrationArtifact {
  readonly schemaVersion: "spoken-narration-v1";
  readonly owner: "audio";
  readonly episodeId: string;
  readonly language: string;
  readonly locale: string;
  readonly variant: "full" | "short";
  readonly sourcePath: string;
  readonly sourceNarrationFingerprint: string;
  readonly spokenTextFingerprint: string;
  readonly preparationMode: "passthrough" | "deterministic-cleanup" | "openai-adaptation" | "manual";
  readonly model?: string;
  readonly promptVersion: string;
  readonly warnings: readonly string[];
  readonly generatedAt: string;
}
```

`spoken-text.md` contains the actual spoken text.

## Adaptation Strategy

Wave 1 should implement deterministic cleanup only:

- normalize whitespace and paragraph breaks;
- remove production labels if detected;
- preserve Markdown-free narration text;
- keep sentence content unchanged unless a configured pronunciation transform applies later.

Wave 2 can add optional OpenAI adaptation through a structured Responses request:

- one language/variant at a time;
- source text plus language profile guidance;
- strict instruction to preserve facts, names, hook, order, and ending;
- output adapted paragraphs plus a change summary;
- validation compares names, quoted phrases, first sentence/hook, and rough word count.

If AI adaptation fails validation, persist a failed artifact and fall back to deterministic cleanup when `allowFallback` is true.

## Cost Controls

- Default to deterministic cleanup.
- Cache by source narration fingerprint, language, variant, prompt version, model, and adaptation profile.
- Never rerun adaptation when the artifact fingerprint matches.
- Do not adapt context-only text for every chunk.

Cost impact: negligible for deterministic mode, low to moderate for optional OpenAI adaptation.
