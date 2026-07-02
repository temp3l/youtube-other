import { describe, expect, it } from "vitest";
import {
  areTreatmentsCompatible,
  getTreatment,
  isTreatmentSupported,
  isTreatmentValidForAspectRatio,
  isTreatmentValidForDuration,
  isTreatmentValidForPhase,
  shotTreatmentCatalog,
  shotTreatmentCatalogVersion,
} from "./visual-retention/treatment-catalog.js";

describe("shot treatment catalog", () => {
  it("keeps stable treatment ids unique and exposes a deterministic version", () => {
    const ids = shotTreatmentCatalog.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(shotTreatmentCatalogVersion).toBe("shot-treatment-catalog-v1");
  });

  it("answers aspect-ratio, phase, and duration queries", () => {
    expect(isTreatmentValidForAspectRatio("vertical-smart-crop", "9:16")).toBe(
      true,
    );
    expect(isTreatmentValidForAspectRatio("vertical-smart-crop", "16:9")).toBe(
      false,
    );
    expect(isTreatmentValidForPhase("face-close-up", "climax")).toBe(true);
    expect(isTreatmentValidForPhase("face-close-up", "aftermath")).toBe(false);
    expect(isTreatmentValidForDuration("fast-push-in", 2_000)).toBe(true);
    expect(isTreatmentValidForDuration("fast-push-in", 4_000)).toBe(false);
  });

  it("represents supported and unsupported-by-default advanced treatments safely", () => {
    expect(isTreatmentSupported("medium-crop")).toBe(true);
    expect(isTreatmentSupported("layered-pseudo-parallax")).toBe(false);

    expect(getTreatment("layered-pseudo-parallax")).toMatchObject({
      status: "later-phase",
      derivedClipCacheRequired: true,
      availableByDefault: false,
    });
    expect(getTreatment("split-framing")).toMatchObject({
      status: "later-phase",
      derivedClipCacheRequired: true,
      availableByDefault: false,
    });
  });

  it("detects known incompatible combinations and permits safe defaults", () => {
    expect(
      areTreatmentsCompatible(["face-close-up", "layered-pseudo-parallax"]),
    ).toBe(false);
    expect(
      areTreatmentsCompatible([
        "blurred-fill",
        "split-framing",
        "security-camera-overlay",
      ]),
    ).toBe(false);
    expect(
      areTreatmentsCompatible(["declassified-file-overlay", "static-burst"]),
    ).toBe(false);

    expect(
      areTreatmentsCompatible(["smart-crop", "slow-push-in", "film-grain"]),
    ).toBe(true);
    expect(
      areTreatmentsCompatible([
        "object-detail-crop",
        "recording-timestamp",
        "short-dissolve",
      ]),
    ).toBe(true);
  });

  it("exposes readonly catalog entries and fails predictably for unknown ids", () => {
    expect(Object.isFrozen(shotTreatmentCatalog)).toBe(true);

    const mediumCrop = getTreatment("medium-crop");
    expect(mediumCrop).toBeDefined();
    expect(Object.isFrozen(mediumCrop)).toBe(true);
    expect(Object.isFrozen(mediumCrop?.aspectRatios)).toBe(true);
    expect(mediumCrop?.aspectRatios).toEqual(["16:9", "9:16"]);
    if (mediumCrop) {
      expect(
        Reflect.set(
          mediumCrop.aspectRatios,
          mediumCrop.aspectRatios.length,
          "1:1",
        ),
      ).toBe(false);
    }

    expect(getTreatment("not-a-treatment")).toBeUndefined();
    expect(isTreatmentSupported("not-a-treatment")).toBe(false);
    expect(
      areTreatmentsCompatible(["medium-crop", "not-a-treatment"]),
    ).toBe(false);
  });
});
