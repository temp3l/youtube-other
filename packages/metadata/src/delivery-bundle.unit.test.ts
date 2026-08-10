import { describe, expect, it } from "vitest";
import {
  planDeliveryBundle,
  redactDeliveryBundleFailure,
} from "./delivery-bundle.js";

const hash = (character: string) => character.repeat(64);

function input() {
  return {
    contentProfileId: "strategic-reinvention" as const,
    episodeId: "episode-001",
    productionRevisionId: "production-001",
    locale: "it",
    metadata: {
      title: "Titolo approvato",
      description: "Descrizione modificabile e localizzata.",
      tags: ["storia", "italia"],
      chapters: [{ startSeconds: 0, title: "Introduzione" }],
      thumbnailText: "Una storia",
    },
    files: {
      render: { artifactId: "render-001", relativePath: "locales/it/full/renders/youtube/final.mp4", fingerprint: hash("a") },
      preview: { artifactId: "preview-001", relativePath: "locales/it/full/renders/youtube/final.preview.mp4", fingerprint: hash("b") },
    },
    effectiveConfiguration: { packaging: "v1" },
    dependencyIdentity: { render: hash("a"), localeEdition: hash("c") },
    provenance: {
      source: "approved-revision-artifacts" as const,
      localeEditionId: "locale-edition-001",
      localeEditionFingerprint: hash("c"),
      renderDerivativeId: "render-001",
      renderDerivativeFingerprint: hash("a"),
    },
    approval: { state: "approved" as const, approvalIds: ["approval-locale", "approval-render"], boundRevision: "production-001" },
    regenerationRationale: "new-delivery-bundle" as const,
  };
}

describe("delivery bundle planning", () => {
  it("keeps editable locale metadata revision-bound without invalidating visuals", () => {
    const first = planDeliveryBundle(input());
    const repeat = planDeliveryBundle({ ...input(), previousBundle: first.bundle });
    const edited = planDeliveryBundle({
      ...input(),
      metadata: { ...input().metadata, title: "Titolo aggiornato" },
      regenerationRationale: "metadata-changed",
    });

    expect(first.bundle.contentProfileId).toBe("veronicabenini");
    expect(first.bundle.execution).toEqual({ state: "planned", providerDispatchEnabled: false, publicationEnabled: false });
    expect(first.bundle.visualsInvalidated).toBe(false);
    expect(repeat.reused).toBe(true);
    expect(edited.bundle.metadataRevisionId).not.toBe(first.bundle.metadataRevisionId);
    expect(edited.bundle.files.render).toEqual(first.bundle.files.render);
  });

  it("fails closed for an unsafe delivery path and redacts unsafe failure evidence", () => {
    expect(() => planDeliveryBundle({
      ...input(),
      files: { ...input().files, render: { ...input().files.render, relativePath: "../publish.mp4" } },
    })).toThrow();
    expect(() => planDeliveryBundle({
      ...input(),
      approval: { ...input().approval, approvalIds: ["same-actor", "same-actor"] },
    })).toThrow("distinct");
    const failure = redactDeliveryBundleFailure(new Error("/private/token"));
    expect(failure).toEqual({
      code: "DELIVERY_BUNDLE_INVALID",
      message: "Delivery bundle planning was blocked; inspect approved revision and artifact identities.",
    });
  });
});
