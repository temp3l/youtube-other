import { describe, expect, it } from "vitest";
import {
  inferSceneTextRequirement,
  sceneSchema,
  sceneTextRequirementSchema,
} from "./index.js";

describe("scene text requirement schema", () => {
  it("defaults legacy scenes to no readable text", () => {
    const scene = sceneSchema.parse({
      id: "scene-001",
      sequenceNumber: 1,
      canonicalNarration: "A quiet room with a lamp.",
      sourceSegmentIds: ["segment-001"],
      estimatedDurationSeconds: 4,
      timing: { startSeconds: 0, endSeconds: 4 },
      visualPurpose: "establish",
      subject: "quiet room",
      action: "shown",
      setting: "small apartment",
      composition: "centered",
      cameraFraming: "medium shot",
      mood: "calm",
      continuityReferences: [],
      onScreenText: "",
      negativeConstraints: [],
      aspectRatios: ["16:9"],
      imagePrompt: "quiet room",
      expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
      qualityStatus: "draft",
    });

    expect(scene.textRequirement).toEqual({ required: false });
  });

  it("infers short scene-native text for signs, badges, room numbers, and codes", () => {
    expect(
      inferSceneTextRequirement("A security badge reads MARA COLE.")
    ).toEqual({
      required: true,
      text: "MARA COLE",
      reason: "The narration depends on a short piece of visible written information.",
    });
    expect(
      inferSceneTextRequirement("A road sign says EXIT 12.")
    ).toEqual({
      required: true,
      text: "EXIT 12",
      reason: "The narration depends on a short piece of visible written information.",
    });
    expect(
      inferSceneTextRequirement("A warning sign says KEEP OUT.")
    ).toEqual({
      required: true,
      text: "KEEP OUT",
      reason: "The narration depends on a short piece of visible written information.",
    });
    expect(
      inferSceneTextRequirement("The plaque shows room 237.")
    ).toEqual({
      required: true,
      text: "ROOM 237",
      reason: "The narration depends on a short piece of visible written information.",
    });
    expect(
      inferSceneTextRequirement("The file lists code ZX-47.")
    ).toEqual({
      required: true,
      text: "ZX-47",
      reason: "The narration depends on a short piece of visible written information.",
    });
  });

  it("normalizes, validates, and preserves localized required text", () => {
    expect(
      sceneTextRequirementSchema.parse({
        required: true,
        text: "  ROOM   237  ",
        reason: "The room number is essential to the narrated reveal.",
      })
    ).toEqual({
      required: true,
      text: "ROOM 237",
      reason: "The room number is essential to the narrated reveal.",
    });

    expect(
      sceneTextRequirementSchema.parse({
        required: true,
        text: "ZIMMER 12",
        reason: "Der Zimmername ist für die Enthüllung wichtig.",
      })
    ).toEqual({
      required: true,
      text: "ZIMMER 12",
      reason: "Der Zimmername ist für die Enthüllung wichtig.",
    });

    expect(
      sceneTextRequirementSchema.parse({
        required: true,
        text: "PUERTA SALIDA",
        reason: "El texto visible forma parte de la escena.",
      })
    ).toEqual({
      required: true,
      text: "PUERTA SALIDA",
      reason: "El texto visible forma parte de la escena.",
    });

    expect(
      sceneTextRequirementSchema.parse({
        required: true,
        text: "SORTIE",
        reason: "Le texte fait partie de la scène.",
      })
    ).toEqual({
      required: true,
      text: "SORTIE",
      reason: "Le texte fait partie de la scène.",
    });
  });

  it("rejects invalid required text", () => {
    expect(
      sceneTextRequirementSchema.safeParse({
        required: true,
        text: " ",
        reason: "Needed for the scene.",
      }).success
    ).toBe(false);
    expect(
      sceneTextRequirementSchema.safeParse({
        required: true,
        text: "ROOM 237",
      }).success
    ).toBe(false);
    expect(
      sceneTextRequirementSchema.safeParse({
        required: true,
        text: "   ",
        reason: "Needed for the scene.",
      }).success
    ).toBe(false);
    expect(
      sceneTextRequirementSchema.safeParse({
        required: true,
        text: "THIS TEXT IS FAR TOO LONG TO FIT ON THE SCENE AND SHOULD FAIL",
        reason: "Needed for the scene.",
      }).success
    ).toBe(false);
    expect(
      sceneTextRequirementSchema.safeParse({
        required: true,
        text: "TOO MANY WORDS FOR A SMALL LABEL",
        reason: "Needed for the scene.",
      }).success
    ).toBe(false);
  });
});
