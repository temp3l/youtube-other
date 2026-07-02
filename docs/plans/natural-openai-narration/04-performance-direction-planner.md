# Performance Direction Planner

## Objective

Generate chunk-level delivery instructions that reduce repetitive cadence while remaining deterministic and auditable.

## Current Evidence

- `packages/speech/src/voice-settings.ts` provides global voice instructions only.
- `packages/dark-truth/src/index.ts` has a `SpeechSegment` model with `pace`, `intensity`, and pauses, but this is not integrated into the main CLI path.
- `apps/cli/src/index.ts` currently sends the same `audioInstruction.instructions` for all chunks.

## Recommendation

Use a hybrid planner:

- deterministic defaults are always available;
- optional OpenAI planning can enrich directions;
- if OpenAI planning fails or exceeds budget, fall back to deterministic directions.

## Deterministic Defaults

Derive directions from:

- chunk sequence and total count;
- explicit role from segmentation;
- language profile WPM;
- full vs short variant;
- sentence punctuation and paragraph position;
- hook/closing heuristics.

Defaults:

- hook: intimate or uneasy, measured/brisk pace, low-to-medium intensity.
- setup: neutral/curious, normal/brisk, low intensity.
- discovery: uneasy, measured, medium intensity.
- escalation: urgent/uneasy, brisk, medium-high intensity.
- climax/reveal: restrained/disturbed, measured, high intensity but high restraint.
- aftermath/closing: reflective/intimate, slow/measured, lower volume implication.

## Optional OpenAI Planning

Use Responses structured output, not TTS, to produce directions from the spoken narration and chunk manifest. Persist `performance-directions.json` with:

- planner mode: `deterministic` or `openai-assisted`;
- model and prompt version;
- parent chunk manifest fingerprint;
- generated directions;
- validation warnings.

Validation rejects:

- missing chunk IDs;
- unknown roles or enum values;
- emphasis words not present in chunk text;
- negative constraints omitted;
- excessive pauses;
- delivery notes longer than configured limits.

## Negative Constraints

Every chunk direction should inherit base constraints:

- no movie-trailer voice;
- no radio-announcer cadence;
- no upbeat explainer tone;
- no exaggerated suspense;
- no identical emphasis on every sentence;
- no dramatic pause after every clause;
- no constant breathiness;
- no sing-song sentence endings.

Chunk-specific constraints can add language or role details.

## Cost Impact

- Deterministic planning: negligible.
- Optional OpenAI planning: low for one request per language/variant, not per chunk.
