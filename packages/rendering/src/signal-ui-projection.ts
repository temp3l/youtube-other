import {
  localizedSignalUiProjectionSchema,
  rejectScreenshotDerivedSignalUIState,
  signalUiStateSchema,
  type LocalizedSignalUiProjection,
  type SignalUIState,
} from "@mediaforge/domain";

export const SIGNAL_UI_COMPOSITOR_ARTIFACT_SCHEMA_VERSION =
  "mediaforge.signal-ui-compositor.v1" as const;

export type SignalUiCompositorArtifact = {
  readonly schemaVersion: typeof SIGNAL_UI_COMPOSITOR_ARTIFACT_SCHEMA_VERSION;
  readonly locale: LocalizedSignalUiProjection["locale"];
  readonly stateId: string;
  readonly projectionFingerprint: string;
  readonly compositorRevision: string;
  readonly renderLayers: readonly {
    readonly layerId: string;
    readonly bounds: LocalizedSignalUiProjection["screenBounds"];
    readonly text: string;
    readonly kind: LocalizedSignalUiProjection["elements"][number]["kind"];
  }[];
  readonly dependencyIdentity: Readonly<{
    readonly signalUiStateFingerprint: string;
    readonly locale: LocalizedSignalUiProjection["locale"];
  }>;
};

export function assertCanonicalSignalUIState(
  state: unknown,
): SignalUIState {
  const admission = rejectScreenshotDerivedSignalUIState(state);
  if (!admission.ok) {
    throw new Error(admission.message);
  }
  return admission.state;
}

export function compileLocalizedSignalUiCompositorArtifact(
  projection: LocalizedSignalUiProjection,
): SignalUiCompositorArtifact {
  const parsed = localizedSignalUiProjectionSchema.parse(projection);
  return {
    schemaVersion: SIGNAL_UI_COMPOSITOR_ARTIFACT_SCHEMA_VERSION,
    locale: parsed.locale,
    stateId: parsed.stateId,
    projectionFingerprint: parsed.fingerprint,
    compositorRevision: parsed.compositorRevision,
    renderLayers: parsed.elements
      .filter((element) => element.visibility === "visible")
      .map((element) => ({
        layerId: element.elementId,
        bounds: element.layoutBounds,
        text: element.text,
        kind: element.kind,
      }))
      .sort((left, right) => left.layerId.localeCompare(right.layerId)),
    dependencyIdentity: {
      signalUiStateFingerprint: parsed.stateFingerprint,
      locale: parsed.locale,
    },
  };
}
