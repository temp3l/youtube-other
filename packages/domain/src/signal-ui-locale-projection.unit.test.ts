import { describe, expect, it } from "vitest";

import {
  FIXED_SIGNAL_APP_LABELS,
  fingerprintSignalUIState,
  projectSignalUiForLocale,
  projectSignalUiForLocaleSafe,
  rejectScreenshotDerivedSignalUIState,
  signalUiLocaleTextBundleSchema,
  signalUiStateSchema,
  validateSignalUIState,
} from "./index.js";

const canonicalState = signalUiStateSchema.parse({
  schemaVersion: "mediaforge.signal-ui-state.v1",
  stateId: "signal-ui.e001.insert-001",
  shotSemanticId: "shot.e001.signal-insert-001",
  templateId: "signal-phone.v1",
  screenBounds: { x: 0.22, y: 0.18, width: 0.56, height: 0.64 },
  phoneFrameBounds: { x: 0.18, y: 0.12, width: 0.64, height: 0.76 },
  elements: [
    {
      elementId: "header.app-name",
      kind: "app-label-slot",
      layoutBounds: { x: 0.24, y: 0.2, width: 0.52, height: 0.06 },
      contentRef: "term.signal-app-name",
    },
    {
      elementId: "countdown.primary",
      kind: "countdown",
      layoutBounds: { x: 0.3, y: 0.3, width: 0.4, height: 0.08 },
      contentRef: "countdown.seven-minutes",
    },
    {
      elementId: "message.body-001",
      kind: "message-body",
      layoutBounds: { x: 0.24, y: 0.42, width: 0.52, height: 0.24 },
      contentRef: "script.warning-001",
    },
  ],
  criticalRevealRegions: [
    {
      revealId: "countdown.digits",
      bounds: { x: 0.3, y: 0.3, width: 0.4, height: 0.08 },
      priority: "must-remain-visible",
      linkedElementId: "countdown.primary",
    },
  ],
  provenance: {
    source: "typed-state",
    rejectsScreenshotCanon: true,
  },
});

describe("Signal UI canonical state", () => {
  it("rejects English screenshot-derived UI as canonical state", () => {
    expect(
      rejectScreenshotDerivedSignalUIState({
        locale: "en-US",
        text: "Seven minutes before Ethan dies",
        provenance: { source: "screenshot", rejectsScreenshotCanon: true },
        elements: [],
      }),
    ).toMatchObject({
      ok: false,
      code: "screenshot_canon_rejected",
    });
    expect(
      rejectScreenshotDerivedSignalUIState({
        ...canonicalState,
        elements: [
          {
            elementId: "message.body-001",
            kind: "message-body",
            layoutBounds: { x: 0.24, y: 0.42, width: 0.52, height: 0.24 },
            contentRef: "script.warning-001",
            text: "Seven minutes before Ethan dies",
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      code: "screenshot_canon_rejected",
    });
  });

  it("rejects readable English sentences in canonical contentRef values", () => {
    expect(() =>
      validateSignalUIState({
        ...canonicalState,
        elements: [
          {
            elementId: "message.body-001",
            kind: "message-body",
            layoutBounds: { x: 0.24, y: 0.42, width: 0.52, height: 0.24 },
            contentRef: "you will die in seven minutes",
          },
        ],
      }),
    ).toThrow();
  });

  it("projects locale compositor text without mutating canonical state", () => {
    const locales = ["en-US", "de-DE", "es-ES", "pt-BR"] as const;
    const localizedBodies: Record<(typeof locales)[number], string> = {
      "en-US": "Seven minutes before Ethan dies.",
      "de-DE": "Sieben Minuten, bevor Ethan stirbt.",
      "es-ES": "Siete minutos antes de que Ethan muera.",
      "pt-BR": "Sete minutos antes de Ethan morrer.",
    };

    for (const locale of locales) {
      const bundle = signalUiLocaleTextBundleSchema.parse({
        locale,
        slots: [
          { contentRef: "countdown.seven-minutes", text: "07:00" },
          { contentRef: "script.warning-001", text: localizedBodies[locale] },
        ],
      });
      const result = projectSignalUiForLocale({
        state: canonicalState,
        locale,
        textBundle: bundle,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }
      expect(result.projection.locale).toBe(locale);
      expect(result.projection.elements.find((element) => element.elementId === "header.app-name")?.text).toBe(
        FIXED_SIGNAL_APP_LABELS[locale],
      );
      expect(result.projection.elements.find((element) => element.elementId === "message.body-001")?.text).toBe(
        localizedBodies[locale],
      );
      expect(result.projection.stateFingerprint).toBe(fingerprintSignalUIState(canonicalState));
    }
  });

  it("reports missing locale slots without fabricating English canon text", () => {
    const result = projectSignalUiForLocaleSafe({
      state: canonicalState,
      locale: "en-US",
      textBundle: signalUiLocaleTextBundleSchema.parse({
        locale: "en-US",
        slots: [{ contentRef: "countdown.seven-minutes", text: "07:00" }],
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("missing_text_slot");
  });
});
