import { hashText, normalizeWhitespace } from "@mediaforge/shared";
import type {
  NarrationChunk,
  NarrationDirection,
  NarrationVariant,
} from "./narration-schemas.js";

export const OPENAI_TTS_REQUEST_SCHEMA_VERSION = "openai-tts-request-v1" as const;
export const OPENAI_TTS_INSTRUCTION_PROMPT_VERSION = "openai-tts-instructions-v1" as const;

export type OpenAiSpeechOutputFormat = "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

export interface OpenAiTtsBudgetConfig {
  readonly maxInputChars?: number;
  readonly maxInstructionsChars?: number;
  readonly maxContextChars?: number;
  readonly maxBaseInstructionChars?: number;
  readonly maxDeliveryNoteChars?: number;
  readonly maxPronunciationChars?: number;
}

export interface OpenAiTtsRequestConfig {
  readonly model: string;
  readonly voice: string;
  readonly speed?: number;
  readonly outputFormat?: OpenAiSpeechOutputFormat;
  readonly language: string;
  readonly locale: string;
  readonly variant: NarrationVariant;
  readonly baseVoiceInstructions: string;
  readonly providerBaseUrlIdentity?: string;
  readonly schemaVersion?: string;
  readonly promptVersion?: string;
  readonly budgets?: OpenAiTtsBudgetConfig;
}

export interface BuildOpenAiTtsChunkRequestInput {
  readonly chunk: NarrationChunk;
  readonly direction: NarrationDirection;
  readonly config: OpenAiTtsRequestConfig;
  readonly transformedText?: string;
  readonly pronunciationHints?: readonly string[];
  readonly continuityGuidance?: string;
}

export interface OpenAiTtsChunkRequest {
  readonly input: string;
  readonly model: string;
  readonly voice: string;
  readonly instructions: string;
  readonly response_format: OpenAiSpeechOutputFormat;
  readonly speed?: number;
}

export interface NarrationTtsFingerprintInput {
  readonly schemaVersion: string;
  readonly promptVersion: string;
  readonly chunkId: string;
  readonly sourceTextHash: string;
  readonly inputTextHash: string;
  readonly previousContextHash: string;
  readonly nextContextHash: string;
  readonly model: string;
  readonly voice: string;
  readonly speed: number;
  readonly outputFormat: OpenAiSpeechOutputFormat;
  readonly language: string;
  readonly locale: string;
  readonly variant: NarrationVariant;
  readonly instructionsHash: string;
  readonly directionHash: string;
  readonly pronunciationHash: string;
  readonly providerBaseUrlIdentity: string;
}

export interface OpenAiTtsPromptLogMetadata {
  readonly schemaVersion: string;
  readonly promptVersion: string;
  readonly chunkId: string;
  readonly model: string;
  readonly voice: string;
  readonly speed: number;
  readonly outputFormat: OpenAiSpeechOutputFormat;
  readonly language: string;
  readonly locale: string;
  readonly variant: NarrationVariant;
  readonly inputChars: number;
  readonly instructionChars: number;
  readonly previousContextChars: number;
  readonly nextContextChars: number;
  readonly inputTextHash: string;
  readonly instructionHash: string;
  readonly requestFingerprint: string;
}

export interface OpenAiTtsRequestBuildResult {
  readonly request: OpenAiTtsChunkRequest;
  readonly requestFingerprint: string;
  readonly fingerprintInput: NarrationTtsFingerprintInput;
  readonly promptLogMetadata: OpenAiTtsPromptLogMetadata;
  readonly warnings: readonly string[];
}

const supportedOutputFormats = new Set<OpenAiSpeechOutputFormat>([
  "mp3",
  "opus",
  "aac",
  "flac",
  "wav",
  "pcm",
]);

const defaultBudgets = {
  maxInputChars: 4_096,
  maxInstructionsChars: 4_096,
  maxContextChars: 500,
  maxBaseInstructionChars: 1_600,
  maxDeliveryNoteChars: 500,
  maxPronunciationChars: 600,
} as const;

function limitText(value: string, maxChars: number): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxChars) {
    return normalized;
  }
  const sliced = normalized.slice(0, Math.max(0, maxChars)).trim();
  return sliced.replace(/\s+\S*$/u, "").trim() || sliced;
}

function normalizeLines(values: readonly string[]): string[] {
  return values.map((value) => normalizeWhitespace(value)).filter((value) => value.length > 0);
}

function joinSection(title: string, values: readonly string[]): string {
  const body = normalizeLines(values).join(" ");
  return body.length > 0 ? `${title}: ${body}` : "";
}

function compactInstructions(parts: readonly string[], maxChars: number): string {
  const normalized = normalizeLines(parts).join("\n");
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return limitText(normalized, maxChars);
}

function formatNegativeConstraints(values: readonly string[]): string {
  return [...new Set(normalizeLines(values))].join(" ");
}

function materialDirection(direction: NarrationDirection): Record<string, unknown> {
  return {
    chunkId: direction.chunkId,
    role: direction.role,
    mood: direction.mood,
    pace: direction.pace,
    intensity: direction.intensity,
    restraint: direction.restraint,
    pauseBeforeMs: direction.pauseBeforeMs,
    pauseAfterMs: direction.pauseAfterMs,
    emphasisTargets: direction.emphasisTargets,
    deliveryNote: direction.deliveryNote,
    negativeConstraints: direction.negativeConstraints,
    continuityGuidance: direction.continuityGuidance,
    flowIntent: direction.flowIntent,
    pronunciationGuidanceReferences: direction.pronunciationGuidanceReferences ?? [],
  };
}

function resolveBudgets(config: OpenAiTtsRequestConfig): Required<OpenAiTtsBudgetConfig> {
  return {
    maxInputChars: config.budgets?.maxInputChars ?? defaultBudgets.maxInputChars,
    maxInstructionsChars: config.budgets?.maxInstructionsChars ?? defaultBudgets.maxInstructionsChars,
    maxContextChars: config.budgets?.maxContextChars ?? defaultBudgets.maxContextChars,
    maxBaseInstructionChars: config.budgets?.maxBaseInstructionChars ?? defaultBudgets.maxBaseInstructionChars,
    maxDeliveryNoteChars: config.budgets?.maxDeliveryNoteChars ?? defaultBudgets.maxDeliveryNoteChars,
    maxPronunciationChars: config.budgets?.maxPronunciationChars ?? defaultBudgets.maxPronunciationChars,
  };
}

function validateConfig(config: OpenAiTtsRequestConfig): OpenAiSpeechOutputFormat {
  const outputFormat = config.outputFormat ?? "wav";
  if (!supportedOutputFormats.has(outputFormat)) {
    throw new Error(`Unsupported OpenAI speech output format: ${outputFormat}`);
  }
  if (normalizeWhitespace(config.model).length === 0) {
    throw new Error("OpenAI TTS request requires a model.");
  }
  if (normalizeWhitespace(config.voice).length === 0) {
    throw new Error("OpenAI TTS request requires a voice.");
  }
  return outputFormat;
}

function buildInstructions(input: BuildOpenAiTtsChunkRequestInput): {
  readonly instructions: string;
  readonly previousContext: string;
  readonly nextContext: string;
  readonly warnings: readonly string[];
} {
  const budgets = resolveBudgets(input.config);
  const warnings: string[] = [];
  const previousContext = limitText(input.chunk.previousContextExcerpt, budgets.maxContextChars);
  const nextContext = limitText(input.chunk.nextContextExcerpt, budgets.maxContextChars);
  const pronunciation = limitText((input.pronunciationHints ?? []).join("; "), budgets.maxPronunciationChars);
  const deliveryNote = limitText(input.direction.deliveryNote, budgets.maxDeliveryNoteChars);
  const baseInstructions = limitText(input.config.baseVoiceInstructions, budgets.maxBaseInstructionChars);
  const continuity = normalizeWhitespace(input.continuityGuidance ?? input.direction.continuityGuidance);
  const instructions = compactInstructions(
    [
      joinSection("Base voice", [baseInstructions]),
      joinSection("Language", [
        `${input.config.language} / ${input.config.locale}`,
        `${input.config.variant} narration`,
      ]),
      joinSection("Current chunk delivery", [
        `Role ${input.direction.role}.`,
        `Mood ${input.direction.mood}.`,
        `Pace ${input.direction.pace}.`,
        `Intensity ${input.direction.intensity.toFixed(2)}.`,
        `Restraint ${input.direction.restraint.toFixed(2)}.`,
        `Pause before ${Math.round(input.direction.pauseBeforeMs)}ms and after ${Math.round(input.direction.pauseAfterMs)}ms.`,
        deliveryNote,
      ]),
      joinSection("Emphasis", input.direction.emphasisTargets),
      joinSection("Pronunciation hints", [pronunciation]),
      joinSection("Continuity guidance", [
        continuity,
        "Previous and next context are for performance continuity only and must not be spoken.",
      ]),
      joinSection("Previous context do not speak", [previousContext]),
      joinSection("Next context do not speak", [nextContext]),
      joinSection("Negative constraints", [formatNegativeConstraints(input.direction.negativeConstraints)]),
    ],
    budgets.maxInstructionsChars
  );
  if (instructions.length >= budgets.maxInstructionsChars) {
    warnings.push("Instructions were trimmed to the configured character budget.");
  }
  return { instructions, previousContext, nextContext, warnings };
}

export function buildOpenAiTtsChunkRequest(
  input: BuildOpenAiTtsChunkRequestInput
): OpenAiTtsRequestBuildResult {
  const outputFormat = validateConfig(input.config);
  const budgets = resolveBudgets(input.config);
  const ttsInput = normalizeWhitespace(input.transformedText ?? input.chunk.text);
  if (ttsInput.length === 0) {
    throw new Error(`OpenAI TTS input is empty for chunk ${input.chunk.chunkId}.`);
  }
  if (ttsInput.length > budgets.maxInputChars) {
    throw new Error(`OpenAI TTS input for chunk ${input.chunk.chunkId} exceeds ${budgets.maxInputChars} characters.`);
  }
  if (input.direction.chunkId !== input.chunk.chunkId) {
    throw new Error(`Direction chunk ID ${input.direction.chunkId} does not match ${input.chunk.chunkId}.`);
  }
  const { instructions, previousContext, nextContext, warnings } = buildInstructions(input);
  const speed = input.config.speed ?? 1;
  const request: OpenAiTtsChunkRequest = {
    input: ttsInput,
    model: normalizeWhitespace(input.config.model),
    voice: normalizeWhitespace(input.config.voice),
    instructions,
    response_format: outputFormat,
    speed,
  };
  const fingerprintInput: NarrationTtsFingerprintInput = {
    schemaVersion: input.config.schemaVersion ?? OPENAI_TTS_REQUEST_SCHEMA_VERSION,
    promptVersion: input.config.promptVersion ?? OPENAI_TTS_INSTRUCTION_PROMPT_VERSION,
    chunkId: input.chunk.chunkId,
    sourceTextHash: input.chunk.textHash,
    inputTextHash: hashText(ttsInput),
    previousContextHash: hashText(previousContext),
    nextContextHash: hashText(nextContext),
    model: request.model,
    voice: request.voice,
    speed,
    outputFormat,
    language: input.config.language,
    locale: input.config.locale,
    variant: input.config.variant,
    instructionsHash: hashText(instructions),
    directionHash: hashText(JSON.stringify(materialDirection(input.direction))),
    pronunciationHash: hashText(JSON.stringify(input.pronunciationHints ?? [])),
    providerBaseUrlIdentity: input.config.providerBaseUrlIdentity ?? "openai-default",
  };
  const requestFingerprint = hashText(JSON.stringify(fingerprintInput));
  return {
    request,
    requestFingerprint,
    fingerprintInput,
    promptLogMetadata: {
      schemaVersion: fingerprintInput.schemaVersion,
      promptVersion: fingerprintInput.promptVersion,
      chunkId: input.chunk.chunkId,
      model: request.model,
      voice: request.voice,
      speed,
      outputFormat,
      language: input.config.language,
      locale: input.config.locale,
      variant: input.config.variant,
      inputChars: request.input.length,
      instructionChars: request.instructions.length,
      previousContextChars: previousContext.length,
      nextContextChars: nextContext.length,
      inputTextHash: fingerprintInput.inputTextHash,
      instructionHash: fingerprintInput.instructionsHash,
      requestFingerprint,
    },
    warnings,
  };
}
