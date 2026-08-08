import { describe, expect, it } from "vitest";
import {
  deriveHistoryLightingMode,
  planHistorySceneCinematography,
  renderHistoryCameraPerspectivePrompt,
  renderHistoryLightingPrompt,
} from "./history-image-cinematography.js";
import {
  planHistoryImagePromptCinematography,
  renderHistoryImageProviderPrompt,
} from "./history-image-prompt.js";

const baseScene = {
  canonicalNarration:
    "French supply columns struggled on muddy roads as wagons fell behind the march.",
  subject: "French supply columns on muddy roads",
  action: "depicts wagons falling behind the march",
  setting: "1812; Russian Empire",
  cameraFraming: "medium documentary shot",
  composition: "Landscape 16:9, one clear focal point.",
};

function promptRequest(overrides: {
  readonly scene?: Partial<typeof baseScene> & {
    readonly visibleAction?: string;
    readonly focalSubject?: string;
    readonly environment?: string;
    readonly foreground?: string;
    readonly background?: string;
    readonly shotSize?: string;
    readonly cameraAngle?: string;
    readonly composition?: string;
    readonly sourceNarration?: string;
  };
  readonly authoritativeImagePrompt?: string;
  readonly characterContexts?: Array<{
    readonly characterId: string;
    readonly definition?: { readonly name: string };
  }>;
  readonly referenceCharacterIds?: readonly string[];
}) {
  const scene = { ...baseScene, ...overrides.scene };
  return {
    scene: {
      visibleAction: scene.action,
      focalSubject: scene.subject,
      environment: scene.setting,
      foreground: "period wagons and horses",
      background: "muddy road receding into distance",
      shotSize: scene.shotSize ?? "medium",
      cameraAngle: "eye-level",
      composition: scene.composition,
      cameraFraming: scene.cameraFraming,
      lighting: "unused",
      timeOfDay: "daylight",
      mood: "neutral",
      distinctiveAnchor: "supply column delay",
      continuityElements: [],
      prohibitedElements: ["no watermark"],
      textRequirement: { required: false },
      sourceNarration: scene.sourceNarration ?? scene.canonicalNarration,
    },
    aspectRatio: "16:9" as const,
    ...(overrides.authoritativeImagePrompt
      ? { authoritativeImagePrompt: overrides.authoritativeImagePrompt }
      : {}),
    characterContexts: overrides.characterContexts ?? [],
    referenceCharacterIds: overrides.referenceCharacterIds ?? [],
  };
}

describe("history image cinematography", () => {
  it("selects HISTORY_DOCUMENTARY with 40-50mm natural perspective by default", () => {
    const cinematography = planHistorySceneCinematography({
      scene: baseScene,
      shotSize: "medium",
      focalSubject: baseScene.subject,
      characterNames: [],
      referenceCharacterIds: [],
    });
    expect(cinematography.stylePreset).toBe("HISTORY_DOCUMENTARY");
    expect(cinematography.perspective).toBe("STANDARD_40_50MM");
    expect(renderHistoryCameraPerspectivePrompt(cinematography.perspective)).toContain(
      "40-50mm natural perspective"
    );
  });

  it("selects environmental perspective for establishing scenes", () => {
    const cinematography = planHistorySceneCinematography({
      scene: {
        ...baseScene,
        canonicalNarration:
          "A wide landscape view showed the horizon above the river valley.",
        cameraFraming: "wide establishing shot",
      },
      shotSize: "wide",
      focalSubject: "river valley landscape",
      characterNames: [],
      referenceCharacterIds: [],
    });
    expect(cinematography.shotType).toBe("ENVIRONMENTAL_ESTABLISHING");
    expect(cinematography.perspective).toBe("ENVIRONMENTAL_24_35MM");
    expect(renderHistoryCameraPerspectivePrompt(cinematography.perspective)).toContain(
      "24-35mm environmental composition"
    );
  });

  it("selects HISTORY_PORTRAIT for dominant named historical figures", () => {
    const cinematography = planHistorySceneCinematography({
      scene: {
        ...baseScene,
        canonicalNarration:
          "Napoleon reviewed the exhausted army before ordering the retreat.",
        subject: "Napoleon reviewing the army",
      },
      shotSize: "medium",
      focalSubject: "Napoleon reviewing the army",
      characterNames: ["Napoleon Bonaparte"],
      referenceCharacterIds: [],
    });
    expect(cinematography.stylePreset).toBe("HISTORY_PORTRAIT");
    expect(cinematography.perspective).toBe("PORTRAIT_85MM");
  });

  it("adds reference-image identity language only when references are supplied", () => {
    const withReference = renderHistoryImageProviderPrompt(
      promptRequest({
        scene: {
          canonicalNarration: "Napoleon stood at the Berezina crossing.",
          subject: "Napoleon at the Berezina",
          action: "Napoleon observes the crossing",
        },
        characterContexts: [
          { characterId: "napoleon", definition: { name: "Napoleon" } },
        ],
        referenceCharacterIds: ["napoleon"],
      })
    );
    expect(withReference).toContain(
      "accurate facial structure based on supplied reference image"
    );

    const withoutReference = renderHistoryImageProviderPrompt(
      promptRequest({
        scene: {
          canonicalNarration: "Napoleon stood at the Berezina crossing.",
          subject: "Napoleon at the Berezina",
          action: "Napoleon observes the crossing",
        },
        characterContexts: [
          { characterId: "napoleon", definition: { name: "Napoleon" } },
        ],
      })
    );
    expect(withoutReference).not.toContain(
      "accurate facial structure based on supplied reference image"
    );
  });

  it("selects HISTORY_EPIC for large-scale battle scenes", () => {
    const cinematography = planHistorySceneCinematography({
      scene: {
        ...baseScene,
        canonicalNarration:
          "At Borodino the armies fought one of the bloodiest battles of the campaign.",
        subject: "the armies at Borodino",
      },
      shotSize: "wide",
      focalSubject: "the armies at Borodino",
      characterNames: [],
      referenceCharacterIds: [],
    });
    expect(cinematography.stylePreset).toBe("HISTORY_EPIC");
    expect(cinematography.shotType).toBe("EPIC_SCALE");
  });

  it("does not select HISTORY_ARCHIVAL for medieval scenes without explicit photographic intent", () => {
    const cinematography = planHistorySceneCinematography({
      scene: {
        ...baseScene,
        canonicalNarration:
          "In medieval Europe, monks copied manuscripts inside a stone monastery courtyard.",
        setting: "medieval Europe",
      },
      shotSize: "medium",
      focalSubject: "monks in a monastery courtyard",
      characterNames: [],
      referenceCharacterIds: [],
    });
    expect(cinematography.stylePreset).not.toBe("HISTORY_ARCHIVAL");
    expect(cinematography.stylePreset).toBe("HISTORY_DOCUMENTARY");
  });

  it("selects HISTORY_ARCHIVAL with photographic terminology for genuine photographic-era scenes", () => {
    const cinematography = planHistorySceneCinematography({
      scene: {
        ...baseScene,
        canonicalNarration:
          "A 1940s press photograph captured soldiers during the wartime mobilization.",
        setting: "1940s Europe",
      },
      shotSize: "medium",
      focalSubject: "wartime soldiers in a press photograph",
      characterNames: [],
      referenceCharacterIds: [],
    });
    const prompt = renderHistoryImageProviderPrompt(
      promptRequest({
        scene: {
          canonicalNarration:
            "A 1940s press photograph captured soldiers during the wartime mobilization.",
          subject: "wartime soldiers in a press photograph",
          action: "soldiers assembled for the photograph",
        },
      })
    );
    expect(cinematography.stylePreset).toBe("HISTORY_ARCHIVAL");
    expect(prompt).toContain("1940s monochrome press photography");
  });

  it("uses distinct lighting modes instead of a generic natural-light token", () => {
    expect(
      renderHistoryLightingPrompt(
        deriveHistoryLightingMode({
          text: "Soldiers marched through candlelit rooms while officers conferred.",
        })
      )
    ).toContain("candlelight");

    expect(
      renderHistoryLightingPrompt(
        deriveHistoryLightingMode({
          text: "The winter march crossed snow-covered fields in freezing air.",
        })
      )
    ).toContain("winter");

    expect(
      renderHistoryLightingPrompt(
        deriveHistoryLightingMode({ text: "The army advanced under clear skies." })
      )
    ).toBe("naturalistic directional daylight");
  });

  it("does not inject global 35mm/natural-light suffixes into rendered prompts", () => {
    const prompt = renderHistoryImageProviderPrompt(promptRequest({}));
    expect(prompt.toLowerCase()).not.toContain("35mm/natural-light");
    expect(prompt.toLowerCase()).not.toContain("natural-light");
    expect(prompt).toContain("PRIMARY VISUAL EVENT");
    expect(prompt.indexOf("PRIMARY VISUAL EVENT")).toBeLessThan(
      prompt.indexOf("VISUAL STYLE")
    );
  });

  it("exposes diagnostics metadata for auditing", () => {
    const cinematography = planHistoryImagePromptCinematography(
      promptRequest({
        referenceCharacterIds: ["napoleon"],
        characterContexts: [
          { characterId: "napoleon", definition: { name: "Napoleon" } },
        ],
        scene: {
          canonicalNarration: "Napoleon reviewed the army.",
          subject: "Napoleon",
          action: "reviewing troops",
        },
      })
    );
    expect(cinematography.referenceImageCount).toBe(1);
    expect(cinematography.referenceEntityIds).toEqual(["napoleon"]);
  });
});
