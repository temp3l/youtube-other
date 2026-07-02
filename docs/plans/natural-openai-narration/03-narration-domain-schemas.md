# Narration Domain Schemas

## Objective

Add strict TypeScript and Zod schemas for the staged narration pipeline while preserving existing artifacts.

## Location

Implement schemas in `packages/speech/src/narration-schemas.ts` and export them from `packages/speech/src/index.ts`.

## Core Types

```ts
type NarrationVariant = "full" | "short";
type NarrationRole =
  | "hook"
  | "setup"
  | "discovery"
  | "escalation"
  | "climax"
  | "reveal"
  | "aftermath"
  | "closing";

type NarrationMood =
  | "neutral"
  | "curious"
  | "uneasy"
  | "urgent"
  | "intimate"
  | "disturbed"
  | "reflective"
  | "restrained";

type NarrationPace = "slow" | "measured" | "normal" | "brisk" | "fast";
type FlowIntent = "continues" | "soft-stop" | "hard-stop";
```

## Chunk Schema

```ts
interface NarrationChunk {
  readonly id: string;
  readonly sequence: number;
  readonly role: NarrationRole;
  readonly text: string;
  readonly textFingerprint: string;
  readonly sourceParagraphIndexes: readonly number[];
  readonly sourceSentenceIndexes: readonly number[];
  readonly estimatedDurationSeconds: number;
  readonly wordCount: number;
  readonly characterCount: number;
  readonly previousContext: string;
  readonly nextContext: string;
  readonly flowIntent: FlowIntent;
}
```

IDs should be stable: `narr-chunk-001`, `narr-chunk-002`, etc. Stability is tied to ordered segmentation output; fingerprints track content changes.

## Performance Direction Schema

```ts
interface NarrationDirection {
  readonly chunkId: string;
  readonly role: NarrationRole;
  readonly mood: NarrationMood;
  readonly pace: NarrationPace;
  readonly intensity: number; // 0-1
  readonly restraint: number; // 0-1, high means less theatrical
  readonly pauseBeforeMs: number;
  readonly pauseAfterMs: number;
  readonly emphasisWords: readonly string[];
  readonly pronunciationHints: readonly string[];
  readonly continuityNote: string;
  readonly deliveryNote: string;
  readonly negativeConstraints: readonly string[];
  readonly flowIntent: FlowIntent;
}
```

Intensity, restraint, and pauses must have finite numeric bounds in Zod.

## Generation Metadata

Record:

- source fingerprints;
- config snapshot fingerprint;
- prompt/schema versions;
- model, voice, speed, format;
- OpenAI request fingerprint per chunk;
- cache decision;
- validation status;
- fallback usage;
- generated timestamps.

## Compatibility

Do not replace `AudioInstructionArtifact` or `TtsGenerationRecord` immediately. Add adapters that can derive legacy records from new artifacts during rollout.
