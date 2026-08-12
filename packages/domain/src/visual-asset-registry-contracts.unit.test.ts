import { describe, expect, it } from "vitest";

import {
  hashAddressedReferenceAssetSchema,
  shotVisualRegistryReferenceSchema,
  visualRegistryRevisionEnvelopeSchema,
} from "./visual-asset-registry-contracts.js";

describe("visual asset registry contracts", () => {
  it("accepts registry revisions with hash-addressed reference assets", () => {
    const parsed = visualRegistryRevisionEnvelopeSchema.parse({
      schemaVersion: "mediaforge.visual-asset-registry.v1",
      revisionId: "var.loc.office.rev.1",
      seriesId: "series.alpha",
      entryId: "loc.office",
      entryKind: "location",
      revisionNumber: 1,
      status: "ACCEPTED",
      payload: {
        displayName: "Office",
        settingKind: "interior",
      },
      contentHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      parentRevisionIds: [],
      referenceAssets: [
        {
          artifactHash:
            "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          mimeType: "image/png",
          byteSize: 512,
          storageUri: "file:///registry/loc.office/establishing.png",
          role: "establishing",
        },
      ],
      provenance: { sourceKind: "import" },
      createdAt: "2026-08-12T00:00:00.000Z",
    });

    expect(parsed.entryKind).toBe("location");
    expect(parsed.referenceAssets).toHaveLength(1);
  });

  it("accepts shot references that pin stable registry ids and revisions", () => {
    const parsed = shotVisualRegistryReferenceSchema.parse({
      entryId: "prop.phone",
      entryKind: "prop",
      revisionId: "var.prop.phone.rev.2",
    });

    expect(parsed.revisionId).toBe("var.prop.phone.rev.2");
  });

  it("accepts locale-variant reason metadata on reference assets", () => {
    const parsed = hashAddressedReferenceAssetSchema.parse({
      artifactHash:
        "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      mimeType: "image/png",
      byteSize: 256,
      storageUri: "file:///registry/reference/signage-de.png",
      role: "reference",
    });

    expect(parsed.role).toBe("reference");
  });
});
