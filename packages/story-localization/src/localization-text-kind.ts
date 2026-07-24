import { z } from "zod";

export const localizationTextKindSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("spokenDialogue"), sourceText: z.string().min(1), preserveSourceLanguage: z.literal(false) }).strict(),
  z.object({ kind: z.literal("physicalInscription"), sourceText: z.string().min(1), preserveSourceLanguage: z.boolean(), languageIdentityReason: z.string().min(1).optional() }).strict(),
  z.object({ kind: z.literal("deviceText"), sourceText: z.string().min(1), preserveSourceLanguage: z.boolean(), settingReason: z.string().min(1).optional() }).strict(),
  z.object({ kind: z.literal("properName"), sourceText: z.string().min(1), preserveSourceLanguage: z.literal(true) }).strict(),
  z.object({ kind: z.literal("callbackPhrase"), sourceText: z.string().min(1), preserveSourceLanguage: z.literal(false), callbackId: z.string().min(1), approvedLocalizedText: z.string().min(1).optional() }).strict(),
]);
export type LocalizationTextKind = z.infer<typeof localizationTextKindSchema>;

export function requiresNaturalLocalization(value: LocalizationTextKind): boolean {
  return value.kind === "spokenDialogue" || value.kind === "callbackPhrase" || (value.kind === "deviceText" && !value.preserveSourceLanguage);
}
