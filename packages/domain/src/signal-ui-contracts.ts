import { z } from "zod";

const normalizedUnitIntervalSchema = z.number().finite().min(0).max(1);
const positiveFiniteNumberSchema = z.number().finite().positive();

const normalizedCropSchema = z
  .object({
    x: normalizedUnitIntervalSchema,
    y: normalizedUnitIntervalSchema,
    width: positiveFiniteNumberSchema.max(1),
    height: positiveFiniteNumberSchema.max(1),
  })
  .superRefine((value, ctx) => {
    if (value.x + value.width > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["width"],
        message: "Crop width must stay within the normalized source bounds.",
      });
    }
    if (value.y + value.height > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["height"],
        message: "Crop height must stay within the normalized source bounds.",
      });
    }
  });

export const SIGNAL_UI_STATE_SCHEMA_VERSION =
  "mediaforge.signal-ui-state.v1" as const;
export const SIGNAL_UI_PROJECTION_SCHEMA_VERSION =
  "mediaforge.signal-ui-projection.v1" as const;

export const SIGNAL_UI_BCP47_LOCALES = [
  "en-US",
  "de-DE",
  "es-ES",
  "pt-BR",
] as const;
export const signalUiBcp47LocaleSchema = z.enum(SIGNAL_UI_BCP47_LOCALES);
export type SignalUiBcp47Locale = z.infer<typeof signalUiBcp47LocaleSchema>;

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const contentRefSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/u);

export const signalUiElementKindSchema = z.enum([
  "app-label-slot",
  "header-badge",
  "countdown",
  "sender-label",
  "message-body",
  "status-chip",
  "cta-chip",
]);
export type SignalUiElementKind = z.infer<typeof signalUiElementKindSchema>;

export const signalUiStateElementSchema = z
  .object({
    elementId: identifierSchema,
    kind: signalUiElementKindSchema,
    layoutBounds: normalizedCropSchema,
    contentRef: contentRefSchema,
    visibility: z.enum(["visible", "hidden"]).default("visible"),
  })
  .strict();
export type SignalUiStateElement = z.infer<typeof signalUiStateElementSchema>;

export const signalUiCriticalRevealSchema = z
  .object({
    revealId: identifierSchema,
    bounds: normalizedCropSchema,
    priority: z.literal("must-remain-visible"),
    linkedElementId: identifierSchema.optional(),
  })
  .strict();
export type SignalUiCriticalReveal = z.infer<typeof signalUiCriticalRevealSchema>;

export const signalUiStateProvenanceSchema = z
  .object({
    source: z.enum(["typed-state", "beat-plan", "shot-plan"]),
    rejectsScreenshotCanon: z.literal(true),
  })
  .strict();

export const signalUiStateSchema = z
  .object({
    schemaVersion: z.literal(SIGNAL_UI_STATE_SCHEMA_VERSION),
    stateId: identifierSchema,
    shotSemanticId: identifierSchema,
    templateId: z.literal("signal-phone.v1"),
    screenBounds: normalizedCropSchema,
    phoneFrameBounds: normalizedCropSchema,
    elements: z.array(signalUiStateElementSchema).min(1),
    criticalRevealRegions: z.array(signalUiCriticalRevealSchema).default([]),
    provenance: signalUiStateProvenanceSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const [index, element] of value.elements.entries()) {
      if (containsReadableEnglishSentence(element.contentRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["elements", index, "contentRef"],
          message:
            "Canonical Signal UI contentRef must stay semantic; readable English sentences belong in locale projections.",
        });
      }
    }
  });
export type SignalUIState = z.infer<typeof signalUiStateSchema>;

export const signalUiLocaleTextSlotSchema = z
  .object({
    contentRef: contentRefSchema,
    text: z.string().trim().min(1).max(500),
  })
  .strict();

export const signalUiLocaleTextBundleSchema = z
  .object({
    locale: signalUiBcp47LocaleSchema,
    slots: z.array(signalUiLocaleTextSlotSchema).min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const refs = new Set<string>();
    for (const [index, slot] of value.slots.entries()) {
      if (refs.has(slot.contentRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slots", index, "contentRef"],
          message: "Duplicate locale text slot contentRef.",
        });
      }
      refs.add(slot.contentRef);
    }
  });
export type SignalUiLocaleTextBundle = z.infer<
  typeof signalUiLocaleTextBundleSchema
>;

export const localizedSignalUiElementSchema = z
  .object({
    elementId: identifierSchema,
    kind: signalUiElementKindSchema,
    layoutBounds: normalizedCropSchema,
    contentRef: contentRefSchema,
    text: z.string().trim().min(1).max(500),
    visibility: z.enum(["visible", "hidden"]).default("visible"),
  })
  .strict();
export type LocalizedSignalUiElement = z.infer<
  typeof localizedSignalUiElementSchema
>;

export const localizedSignalUiProjectionSchema = z
  .object({
    schemaVersion: z.literal(SIGNAL_UI_PROJECTION_SCHEMA_VERSION),
    locale: signalUiBcp47LocaleSchema,
    stateId: identifierSchema,
    stateFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    templateId: z.literal("signal-phone.v1"),
    screenBounds: normalizedCropSchema,
    phoneFrameBounds: normalizedCropSchema,
    elements: z.array(localizedSignalUiElementSchema).min(1),
    criticalRevealRegions: z.array(signalUiCriticalRevealSchema).default([]),
    compositorRevision: z.string().trim().min(1).max(120),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
export type LocalizedSignalUiProjection = z.infer<
  typeof localizedSignalUiProjectionSchema
>;

export const FIXED_SIGNAL_APP_LABELS: Readonly<
  Record<SignalUiBcp47Locale, string>
> = {
  "en-US": "Signal",
  "de-DE": "Signal",
  "es-ES": "Señal",
  "pt-BR": "Sinal",
};

const englishSentencePattern =
  /\b(the|you|your|will|before|after|minutes|seconds|phone|message|warning)\b/u;

export function containsReadableEnglishSentence(value: string): boolean {
  if (!englishSentencePattern.test(value)) {
    return false;
  }
  return value.split(/\s+/u).length >= 3;
}

export function validateSignalUIState(state: unknown): SignalUIState {
  return signalUiStateSchema.parse(state);
}

export function rejectScreenshotDerivedSignalUIState(state: unknown):
  | { ok: true; state: SignalUIState }
  | { ok: false; code: "screenshot_canon_rejected"; message: string } {
  if (!state || typeof state !== "object") {
    return {
      ok: false,
      code: "screenshot_canon_rejected",
      message: "Signal UI state must be a typed object, not raster evidence.",
    };
  }
  const candidate = state as Record<string, unknown>;
  const provenance = candidate["provenance"];
  if (
    provenance &&
    typeof provenance === "object" &&
    (provenance as Record<string, unknown>)["source"] === "screenshot"
  ) {
    return {
      ok: false,
      code: "screenshot_canon_rejected",
      message: "English screenshots cannot become canonical Signal UI state.",
    };
  }
  if ("text" in candidate || "displayText" in candidate || "locale" in candidate) {
    return {
      ok: false,
      code: "screenshot_canon_rejected",
      message:
        "Readable text and locale fields belong in compositor projections, not canonical Signal UI state.",
    };
  }
  if (Array.isArray(candidate["elements"])) {
    for (const element of candidate["elements"]) {
      if (
        element &&
        typeof element === "object" &&
        ("text" in element || "displayText" in element)
      ) {
        return {
          ok: false,
          code: "screenshot_canon_rejected",
          message:
            "Canonical Signal UI elements must reference semantic contentRef values only.",
        };
      }
    }
  }
  return { ok: true, state: validateSignalUIState(state) };
}
