# Pronunciation and Text Normalization

## Objective

Provide OpenAI-TTS-only pronunciation control without changing canonical story text or using SSML.

## Current Evidence

- `docs/voice-settings.md` and fallback instructions hard-code terms like `Calhoun` and `Universe 25`.
- `packages/dark-truth/src/index.ts` writes `pronunciation-guide.json`, but the main CLI path does not consume a typed pronunciation transform artifact.
- Current TTS input is raw stripped narration text.

## Design

Add a pronunciation dictionary transform stage before TTS request construction.

Scopes:

- global entries;
- language-specific entries;
- channel/profile entries;
- episode-specific overrides.

Entry shape:

```ts
interface PronunciationEntry {
  readonly id: string;
  readonly language?: string;
  readonly match: string;
  readonly replacement: string;
  readonly matchMode: "word" | "phrase" | "regex-safe";
  readonly caseSensitive: boolean;
  readonly priority: number;
  readonly notes?: string;
}
```

## Safety Rules

- Never use unrestricted string replacement.
- Use Unicode-aware word and phrase boundaries.
- Sort by priority and longest match.
- Detect collisions and overlapping replacements.
- Reject regex entries unless they pass a safe-regex allowlist.
- Preserve an audit trail with before/after excerpt hashes and changed spans.

## Artifact

`pronunciation-transforms.json` records:

- source chunk ID;
- original text hash;
- transformed TTS text hash;
- entries applied;
- skipped collisions;
- warnings;
- generated timestamp.

## Validation

Warn on:

- configured entries that match nothing;
- replacements that expand text excessively;
- entries that alter the hook unexpectedly;
- overlapping terms with equal priority.

Error on:

- unsafe regex;
- replacement that empties text;
- collision that cannot be resolved deterministically.

Cost impact: negligible.
