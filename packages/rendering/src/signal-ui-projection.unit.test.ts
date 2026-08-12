import { describe, expect, it } from "vitest";

import {
  FIXED_SIGNAL_APP_LABELS,
  projectSignalUiForLocale,
  signalUiLocaleTextBundleSchema,
  signalUiStateSchema,
} from "@mediaforge/domain";
import {
  assertCanonicalSignalUIState,
  compileLocalizedSignalUiCompositorArtifact,
} from "./signal-ui-projection.js";

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
      elementId: "message.body-001",
      kind: "message-body",
      layoutBounds: { x: 0.24, y: 0.42, width: 0.52, height: 0.24 },
      contentRef: "script.warning-001",
    },
  ],
  criticalRevealRegions: [],
  provenance: {
    source: "typed-state",
    rejectsScreenshotCanon: true,
  },
});

describe("Signal UI compositor projection", () => {
  it("blocks screenshot canon before compiling compositor layers", () => {
    expect(() =>
      assertCanonicalSignalUIState({
        provenance: { source: "screenshot", rejectsScreenshotCanon: true },
        elements: [{ text: "Seven minutes before Ethan dies" }],
      }),
    ).toThrow(/screenshot/i);
  });

  it("compiles locale-owned readable text into compositor artifacts", () => {
    const state = assertCanonicalSignalUIState(canonicalState);
    const projection = projectSignalUiForLocale({
      state,
      locale: "de-DE",
      textBundle: signalUiLocaleTextBundleSchema.parse({
        locale: "de-DE",
        slots: [
          {
            contentRef: "script.warning-001",
            text: "Sieben Minuten, bevor Ethan stirbt.",
          },
        ],
      }),
    });
    expect(projection.ok).toBe(true);
    if (!projection.ok) {
      return;
    }

    const artifact = compileLocalizedSignalUiCompositorArtifact(projection.projection);
    expect(artifact.locale).toBe("de-DE");
    expect(artifact.renderLayers.map((layer) => layer.text)).toEqual([
      FIXED_SIGNAL_APP_LABELS["de-DE"],
      "Sieben Minuten, bevor Ethan stirbt.",
    ]);
    expect(artifact.dependencyIdentity.locale).toBe("de-DE");
  });
});
