import { createHash } from "node:crypto";

import {
  FIXED_SIGNAL_APP_LABELS,
  SIGNAL_UI_PROJECTION_SCHEMA_VERSION,
  localizedSignalUiProjectionSchema,
  type LocalizedSignalUiProjection,
  type SignalUIState,
  type SignalUiBcp47Locale,
  type SignalUiLocaleTextBundle,
  validateSignalUIState,
} from "./signal-ui-contracts.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function hashCanonical(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export type ProjectSignalUiForLocaleInput = {
  readonly state: SignalUIState;
  readonly locale: SignalUiBcp47Locale;
  readonly textBundle: SignalUiLocaleTextBundle;
  readonly compositorRevision?: string;
};

export type ProjectSignalUiForLocaleResult =
  | { ok: true; projection: LocalizedSignalUiProjection }
  | {
      ok: false;
      code:
        | "locale_mismatch"
        | "missing_text_slot"
        | "unexpected_text_slot";
      message: string;
    };

export function fingerprintSignalUIState(state: SignalUIState): string {
  return hashCanonical({
    schemaVersion: state.schemaVersion,
    stateId: state.stateId,
    shotSemanticId: state.shotSemanticId,
    templateId: state.templateId,
    screenBounds: state.screenBounds,
    phoneFrameBounds: state.phoneFrameBounds,
    elements: state.elements,
    criticalRevealRegions: state.criticalRevealRegions,
  });
}

export function projectSignalUiForLocale(
  input: ProjectSignalUiForLocaleInput,
): ProjectSignalUiForLocaleResult {
  const state = validateSignalUIState(input.state);
  if (input.textBundle.locale !== input.locale) {
    return {
      ok: false,
      code: "locale_mismatch",
      message: "Locale text bundle locale must match projection locale.",
    };
  }

  const slotText = new Map(
    input.textBundle.slots.map((slot) => [slot.contentRef, slot.text]),
  );
  const localizedElements = state.elements.map((element) => {
    const fixedAppLabel =
      element.contentRef === "term.signal-app-name"
        ? FIXED_SIGNAL_APP_LABELS[input.locale]
        : undefined;
    const text = fixedAppLabel ?? slotText.get(element.contentRef);
    if (text === undefined) {
      throw Object.assign(
        new Error(`Missing locale text slot for ${element.contentRef}.`),
        { code: "missing_text_slot" as const },
      );
    }
    if (
      element.contentRef === "term.signal-app-name" &&
      slotText.has(element.contentRef) &&
      slotText.get(element.contentRef) !== fixedAppLabel
    ) {
      throw Object.assign(
        new Error(
          `Fixed localization overrides locale bundle for ${element.contentRef}.`,
        ),
        { code: "unexpected_text_slot" as const },
      );
    }
    return {
      elementId: element.elementId,
      kind: element.kind,
      layoutBounds: element.layoutBounds,
      contentRef: element.contentRef,
      text,
      visibility: element.visibility,
    };
  });

  for (const slot of input.textBundle.slots) {
    const referenced = state.elements.some(
      (element) => element.contentRef === slot.contentRef,
    );
    if (!referenced && slot.contentRef !== "term.signal-app-name") {
      return {
        ok: false,
        code: "unexpected_text_slot",
        message: `Locale bundle references unused contentRef ${slot.contentRef}.`,
      };
    }
  }

  const stateFingerprint = fingerprintSignalUIState(state);
  const compositorRevision =
    input.compositorRevision ?? `signal-ui-compositor.v1:${input.locale}`;
  const fingerprintMaterial = {
    schemaVersion: SIGNAL_UI_PROJECTION_SCHEMA_VERSION,
    locale: input.locale,
    stateId: state.stateId,
    stateFingerprint,
    templateId: state.templateId,
    screenBounds: state.screenBounds,
    phoneFrameBounds: state.phoneFrameBounds,
    elements: localizedElements,
    criticalRevealRegions: state.criticalRevealRegions,
    compositorRevision,
  };

  return {
    ok: true,
    projection: localizedSignalUiProjectionSchema.parse({
      ...fingerprintMaterial,
      fingerprint: hashCanonical(fingerprintMaterial),
    }),
  };
}

export function projectSignalUiForLocaleSafe(
  input: ProjectSignalUiForLocaleInput,
): ProjectSignalUiForLocaleResult {
  try {
    return projectSignalUiForLocale(input);
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "missing_text_slot" || error.code === "unexpected_text_slot")
        ? error.code
        : "missing_text_slot";
    return {
      ok: false,
      code,
      message: error instanceof Error ? error.message : "Projection failed.",
    };
  }
}
