import type { DeliveryBundle } from "@mediaforge/metadata/delivery-bundle";
import {
  planYoutubePublicationIntent,
  type PlanYoutubePublicationIntentInput,
  type YoutubePublicationIntent,
} from "@mediaforge/youtube-upload/publication-intent";

export interface PlanVeronicaYoutubePublicationInput extends Omit<
  PlanYoutubePublicationIntentInput,
  | "contentProfileId"
  | "episodeId"
  | "productionRevisionId"
  | "locale"
  | "deliveryBundleId"
  | "deliveryBundleFingerprint"
  | "effectiveConfigurationHash"
  | "dependencyIdentity"
  | "provenance"
  | "artifacts"
  | "approval"
> {
  readonly deliveryBundle: DeliveryBundle;
}

/** Canonical, provider-free adapter from an approved Veronica delivery bundle. */
export function planVeronicaYoutubePublication(input: PlanVeronicaYoutubePublicationInput): { readonly intent: YoutubePublicationIntent; readonly reused: boolean } {
  const bundle = input.deliveryBundle;
  if (
    bundle.contentProfileId !== "veronicabenini" ||
    bundle.execution.providerDispatchEnabled ||
    bundle.execution.publicationEnabled ||
    bundle.approval.boundRevision !== bundle.productionRevisionId
  ) throw new Error("VERONICA_PUBLICATION_APPROVAL_REQUIRED");
  return planYoutubePublicationIntent({
    ...input,
    contentProfileId: "veronicabenini",
    episodeId: bundle.episodeId,
    productionRevisionId: bundle.productionRevisionId,
    locale: bundle.locale,
    deliveryBundleId: bundle.bundleId,
    deliveryBundleFingerprint: bundle.fingerprint,
    effectiveConfigurationHash: bundle.effectiveConfigurationHash,
    dependencyIdentity: bundle.dependencyIdentity,
    provenance: {
      source: "approved-delivery-bundle",
      localeEditionId: bundle.provenance.localeEditionId,
      localeEditionFingerprint: bundle.provenance.localeEditionFingerprint,
      renderDerivativeId: bundle.provenance.renderDerivativeId,
      renderDerivativeFingerprint: bundle.provenance.renderDerivativeFingerprint,
    },
    artifacts: [
      { assetId: bundle.files.render.artifactId, role: "render", contentHash: bundle.files.render.fingerprint },
      ...(bundle.files.preview ? [{ assetId: bundle.files.preview.artifactId, role: "preview" as const, contentHash: bundle.files.preview.fingerprint }] : []),
      ...(bundle.files.captions ? [{ assetId: bundle.files.captions.artifactId, role: "captions" as const, contentHash: bundle.files.captions.fingerprint }] : []),
    ],
    approval: {
      approvalIds: bundle.approval.approvalIds,
      boundRevision: bundle.approval.boundRevision,
      artifactHash: bundle.fingerprint,
    },
  });
}
