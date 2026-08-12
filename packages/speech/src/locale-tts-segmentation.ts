import { createHash } from "node:crypto";
import { z } from "zod";

import { countSpokenWords, hashText, normalizeWhitespace } from "@mediaforge/shared";

import { canonicalJson } from "./platform/cache-key.js";
import { speechProviderConfigurationSchema } from "./platform/contracts.js";

export const LOCALE_TTS_SEGMENTATION_SCHEMA_VERSION =
  "mediaforge.speech.locale-tts-segmentation.v1" as const;

export const LOCALE_TTS_CACHE_IDENTITY_SCHEMA_VERSION =
  "mediaforge.speech.locale-tts-cache-identity.v1" as const;

export const localeTtsSegmentKindSchema = z.enum(["narration", "dialogue"]);
export type LocaleTtsSegmentKind = z.infer<typeof localeTtsSegmentKindSchema>;

export const localeTtsModelConfigurationSchema = speechProviderConfigurationSchema;
export type LocaleTtsModelConfiguration = z.infer<
  typeof localeTtsModelConfigurationSchema
>;

export const localeTtsSegmentRequestSchema = z
  .object({
    schemaVersion: z.literal(LOCALE_TTS_SEGMENTATION_SCHEMA_VERSION),
    segmentId: z.string().min(1).max(200),
    kind: localeTtsSegmentKindSchema,
    sequence: z.number().int().nonnegative(),
    text: z.string().min(1),
    characterId: z.string().min(1).max(160).optional(),
    scriptRevisionId: z.string().min(1).max(160),
    locale: z.string().min(2).max(16),
    voiceProfileVersionId: z.string().min(1).max(160),
    modelConfigurationHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
export type LocaleTtsSegmentRequest = z.infer<typeof localeTtsSegmentRequestSchema>;

export const localeTtsCacheIdentitySchema = z
  .object({
    schemaVersion: z.literal(LOCALE_TTS_CACHE_IDENTITY_SCHEMA_VERSION),
    cacheKey: z.string().regex(/^[a-f0-9]{64}$/u),
    canonicalInput: z.string().min(1),
    scriptContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    locale: z.string().min(2).max(16),
    voiceProfileVersionId: z.string().min(1).max(160),
    modelConfigurationHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
export type LocaleTtsCacheIdentity = z.infer<typeof localeTtsCacheIdentitySchema>;

const dialogueLinePattern =
  /^(?<speaker>[A-Z][A-Z0-9 .'_-]{0,48}):\s*(?<line>.+)$/u;

function slugifyCharacterId(speaker: string): string {
  const normalized = speaker
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ".")
    .replace(/^\.+|\.+$/gu, "");
  return `character.${normalized || "unknown"}`;
}

function segmentIdFor(scriptRevisionId: string, sequence: number): string {
  return `seg.locale-tts.${scriptRevisionId}.${String(sequence).padStart(3, "0")}`;
}

export function hashLocaleTtsModelConfiguration(
  configuration: LocaleTtsModelConfiguration
): string {
  return hashText(canonicalJson(localeTtsModelConfigurationSchema.parse(configuration)));
}

export function estimateLexicalDurationSeconds(
  wordCount: number,
  targetSpokenWpm: number
): number {
  const safeWpm = Math.max(1, targetSpokenWpm);
  const safeWords = Math.max(0, wordCount);
  return Number(((safeWords / safeWpm) * 60).toFixed(3));
}

export function estimateLexicalDurationMs(
  wordCount: number,
  targetSpokenWpm: number
): number {
  return Math.max(1, Math.round(estimateLexicalDurationSeconds(wordCount, targetSpokenWpm) * 1_000));
}

export function createLocaleTtsCacheIdentity(input: {
  readonly scriptContentHash: string;
  readonly locale: string;
  readonly voiceProfileVersionId: string;
  readonly modelConfiguration: LocaleTtsModelConfiguration;
}): LocaleTtsCacheIdentity {
  const modelConfigurationHash = hashLocaleTtsModelConfiguration(input.modelConfiguration);
  const cacheInput = {
    schemaVersion: LOCALE_TTS_CACHE_IDENTITY_SCHEMA_VERSION,
    scriptContentHash: input.scriptContentHash,
    locale: input.locale,
    voiceProfileVersionId: input.voiceProfileVersionId,
    modelConfigurationHash,
    modelConfiguration: localeTtsModelConfigurationSchema.parse(input.modelConfiguration),
  };
  const canonicalInput = canonicalJson(cacheInput);
  return localeTtsCacheIdentitySchema.parse({
    schemaVersion: LOCALE_TTS_CACHE_IDENTITY_SCHEMA_VERSION,
    canonicalInput,
    cacheKey: createHash("sha256").update(canonicalInput, "utf8").digest("hex"),
    scriptContentHash: input.scriptContentHash,
    locale: input.locale,
    voiceProfileVersionId: input.voiceProfileVersionId,
    modelConfigurationHash,
  });
}

export function segmentLocaleScript(input: {
  readonly scriptText: string;
  readonly scriptRevisionId: string;
  readonly locale: string;
  readonly voiceProfileVersionId: string;
  readonly modelConfiguration: LocaleTtsModelConfiguration;
}): readonly LocaleTtsSegmentRequest[] {
  const modelConfigurationHash = hashLocaleTtsModelConfiguration(input.modelConfiguration);
  const paragraphs = input.scriptText
    .replace(/\r\n/gu, "\n")
    .split(/\n{2,}/u)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter((paragraph) => paragraph.length > 0);

  const requests: LocaleTtsSegmentRequest[] = [];
  let sequence = 0;

  for (const paragraph of paragraphs) {
    const dialogueMatch = dialogueLinePattern.exec(paragraph);
    if (dialogueMatch?.groups?.speaker && dialogueMatch.groups.line) {
      const text = normalizeWhitespace(dialogueMatch.groups.line.replace(/^["“]|["”]$/gu, ""));
      requests.push(
        localeTtsSegmentRequestSchema.parse({
          schemaVersion: LOCALE_TTS_SEGMENTATION_SCHEMA_VERSION,
          segmentId: segmentIdFor(input.scriptRevisionId, sequence),
          kind: "dialogue",
          sequence,
          text,
          characterId: slugifyCharacterId(dialogueMatch.groups.speaker),
          scriptRevisionId: input.scriptRevisionId,
          locale: input.locale,
          voiceProfileVersionId: input.voiceProfileVersionId,
          modelConfigurationHash,
        })
      );
      sequence += 1;
      continue;
    }

    requests.push(
      localeTtsSegmentRequestSchema.parse({
        schemaVersion: LOCALE_TTS_SEGMENTATION_SCHEMA_VERSION,
        segmentId: segmentIdFor(input.scriptRevisionId, sequence),
        kind: "narration",
        sequence,
        text: paragraph,
        scriptRevisionId: input.scriptRevisionId,
        locale: input.locale,
        voiceProfileVersionId: input.voiceProfileVersionId,
        modelConfigurationHash,
      })
    );
    sequence += 1;
  }

  return requests;
}

export function lexicalDurationForSegments(
  segments: readonly Pick<LocaleTtsSegmentRequest, "text">[],
  targetSpokenWpm: number
): number {
  const wordCount = segments.reduce(
    (total, segment) => total + countSpokenWords(segment.text),
    0
  );
  return estimateLexicalDurationMs(wordCount, targetSpokenWpm);
}
