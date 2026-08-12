import { z } from "zod";

export const MICRODRAMA_SHOT_BLOCKING_KINDS = [
  "establishing",
  "reaction",
  "dialogue",
  "insert",
  "phone",
  "offscreen",
  "controlled_mouth",
  "listening",
] as const;
export const microdramaShotBlockingKindSchema = z.enum(MICRODRAMA_SHOT_BLOCKING_KINDS);
export type MicrodramaShotBlockingKind = z.infer<
  typeof microdramaShotBlockingKindSchema
>;

export const MICRODRAMA_SOURCE_PLATE_PROMPT_VERSION =
  "mediaforge.microdrama.source-plate-prompt.v1" as const;

const semanticTokenPattern =
  /^(?:beat|scene|shot|plate)\.sem\.e\d{3}(?:\.[a-z0-9._-]+)+$/u;

export const microdramaSourcePlatePromptInputSchema = z
  .object({
    sourcePlateSemanticId: z.string().min(1),
    sceneSemanticId: z.string().min(1),
    blockingKind: microdramaShotBlockingKindSchema,
    registryRevisionFingerprints: z.array(z.string().regex(/^[a-f0-9]{64}$/u)),
    sceneShotPlanRevisionId: z.string().min(1),
  })
  .strict();
export type MicrodramaSourcePlatePromptInput = z.infer<
  typeof microdramaSourcePlatePromptInputSchema
>;

export type MicrodramaSourcePlatePrompt = {
  readonly schemaVersion: typeof MICRODRAMA_SOURCE_PLATE_PROMPT_VERSION;
  readonly sourcePlateSemanticId: string;
  readonly sceneSemanticId: string;
  readonly blockingKind: MicrodramaShotBlockingKind;
  readonly promptText: string;
  readonly registryRevisionFingerprints: readonly string[];
};

const structuredPromptLinePattern =
  /^(?:schema|plate|scene|blocking|plan|registry|policy):[a-z0-9._:,/-]+$/u;

export function containsLocalizedReadableText(value: string): boolean {
  const normalized = value.normalize("NFC").trim();
  if (normalized.length === 0) {
    return false;
  }

  const lines = normalized.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    return lines.some((line) => {
      if (structuredPromptLinePattern.test(line)) {
        return false;
      }
      return containsLocalizedReadableText(line);
    });
  }

  if (structuredPromptLinePattern.test(normalized)) {
    return false;
  }
  if (semanticTokenPattern.test(normalized)) {
    return false;
  }
  if (/\s/u.test(normalized) || /[A-Z]/u.test(normalized)) {
    return true;
  }
  if (/["'„«»「」]/u.test(normalized)) {
    return true;
  }
  if (/\p{L}{2,}[,.!?;:]\s+\p{L}{2,}/u.test(normalized)) {
    return true;
  }
  if (/[^\x00-\x7F]/u.test(normalized)) {
    return true;
  }
  return false;
}

export function assertSourceImagePromptIsLanguageNeutral(prompt: string): void {
  if (containsLocalizedReadableText(prompt)) {
    throw new Error(
      "Localized readable text cannot enter generated source-image prompts."
    );
  }
}

export function buildMicrodramaSourcePlatePrompt(
  input: MicrodramaSourcePlatePromptInput
): MicrodramaSourcePlatePrompt {
  const parsed = microdramaSourcePlatePromptInputSchema.parse(input);
  const registryRevisionFingerprints = [...parsed.registryRevisionFingerprints].sort();
  const promptText = [
    `schema:${MICRODRAMA_SOURCE_PLATE_PROMPT_VERSION}`,
    `plate:${parsed.sourcePlateSemanticId}`,
    `scene:${parsed.sceneSemanticId}`,
    `blocking:${parsed.blockingKind}`,
    `plan:${parsed.sceneShotPlanRevisionId}`,
    `registry:${registryRevisionFingerprints.join(",")}`,
    "policy:no-readable-text",
  ].join("\n");

  assertSourceImagePromptIsLanguageNeutral(promptText);

  return {
    schemaVersion: MICRODRAMA_SOURCE_PLATE_PROMPT_VERSION,
    sourcePlateSemanticId: parsed.sourcePlateSemanticId,
    sceneSemanticId: parsed.sceneSemanticId,
    blockingKind: parsed.blockingKind,
    promptText,
    registryRevisionFingerprints,
  };
}
