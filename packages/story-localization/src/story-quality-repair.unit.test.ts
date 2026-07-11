import { describe, expect, it } from "vitest";
import { type CharacterRenameMap } from "./character-rename.service.js";
import { repairShortBodyCanonicalNames } from "./story-quality-repair.js";

describe("story quality repair", () => {
  it("repairs leaked original names using the authoritative rename map", () => {
    const renameMap: CharacterRenameMap = {
      version: 1,
      episodeId: "034",
      sourceHash: "source-hash",
      poolId: "test-pool",
      entries: [
        {
          characterId: "character-1",
          originalName: "Elena Marks",
          fictionalName: "Nora Vale",
          originalAliases: ["Elena Marks", "Elena"],
          fictionalAliases: ["Nora Vale", "Nora"],
          role: "protagonist",
        },
      ],
      hash: "0".repeat(64),
    };

    expect(
      repairShortBodyCanonicalNames(
        "Elena Marks checked the mirror. Elena saw it smile first.",
        renameMap
      )
    ).toBe("Nora Vale checked the mirror. Nora saw it smile first.");
  });
});
