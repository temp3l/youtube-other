import {
  planDeliveryBundle,
  type DeliveryBundle,
  type PlanDeliveryBundleInput,
} from "@mediaforge/metadata/delivery-bundle";
import { localeEditionArtifactSchema, type LocaleEditionArtifact } from "@mediaforge/story-localization/locale-edition";
import { veronicaRenderDerivativeSchema, type VeronicaRenderDerivative } from "../rendering/render-derivative.js";

export interface PlanVeronicaDeliveryBundleInput extends Omit<
  PlanDeliveryBundleInput,
  "contentProfileId" | "provenance" | "files" | "approval"
> {
  readonly localeEdition: LocaleEditionArtifact;
  readonly renderDerivative: VeronicaRenderDerivative;
  readonly deliveryApproval: DeliveryBundle["approval"];
}

/** Canonical adapter from approved Veronica derivatives to the shared delivery capability. */
export function planVeronicaDeliveryBundle(input: PlanVeronicaDeliveryBundleInput): {
  readonly bundle: DeliveryBundle;
  readonly reused: boolean;
} {
  const localeEdition = localeEditionArtifactSchema.parse(input.localeEdition);
  const renderDerivative = veronicaRenderDerivativeSchema.parse(input.renderDerivative);
  if (
    localeEdition.contentProfileId !== "veronicabenini" ||
    renderDerivative.contentProfileId !== "veronicabenini"
  ) {
    throw new Error("VERONICA_DELIVERY_PROFILE_INVALID");
  }
  if (
    localeEdition.approval.state !== "approved" ||
    renderDerivative.execution.state !== "planned" ||
    renderDerivative.execution.externalDispatchEnabled
  ) {
    throw new Error("VERONICA_DELIVERY_APPROVAL_REQUIRED");
  }
  if (
    localeEdition.productionRevisionId !== input.productionRevisionId ||
    localeEdition.locale !== input.locale ||
    renderDerivative.productionRevisionId !== input.productionRevisionId ||
    renderDerivative.locale !== input.locale
  ) {
    throw new Error("VERONICA_DELIVERY_REVISION_MISMATCH");
  }
  if (input.deliveryApproval.boundRevision !== input.productionRevisionId) {
    throw new Error("VERONICA_DELIVERY_APPROVAL_REQUIRED");
  }
  const captions = renderDerivative.voice.captionsPath && renderDerivative.voice.captionsFingerprint
    ? {
        artifactId: `captions-${renderDerivative.voice.captionsFingerprint.slice(0, 16)}`,
        relativePath: renderDerivative.voice.captionsPath.replace(/^\/+/, ""),
        fingerprint: renderDerivative.voice.captionsFingerprint,
      }
    : undefined;
  return planDeliveryBundle({
    ...input,
    contentProfileId: "veronicabenini",
    files: {
      render: {
        artifactId: renderDerivative.renderId,
        relativePath: renderDerivative.renderManifest.outputPath.replace(/^\/+/, ""),
        fingerprint: renderDerivative.fingerprint,
      },
      preview: {
        artifactId: `${renderDerivative.renderId}-preview`,
        relativePath: renderDerivative.preview.outputPath.replace(/^\/+/, ""),
        fingerprint: renderDerivative.preview.fingerprint,
      },
      ...(captions ? { captions } : {}),
    },
    provenance: {
      source: "approved-revision-artifacts",
      localeEditionId: localeEdition.editionId,
      localeEditionFingerprint: localeEdition.fingerprint,
      renderDerivativeId: renderDerivative.renderId,
      renderDerivativeFingerprint: renderDerivative.fingerprint,
    },
    approval: input.deliveryApproval,
  });
}
