import { describe, expect, it } from "vitest";

import {
  historyAudioPresets,
  historyMapPlanSchema,
  historyPresetMediaDefaults,
  historyVisualPromptSchema,
} from "./media.js";

describe("history media contracts", () => {
  it("keeps audio provider-neutral and assigns all documentary presets", () => {
    expect(Object.keys(historyAudioPresets)).toEqual([
      "documentary-neutral",
      "documentary-epic",
      "documentary-investigative",
      "documentary-intimate",
    ]);
    expect(Object.keys(historyPresetMediaDefaults)).toHaveLength(10);
    expect(historyPresetMediaDefaults["civilization-rise-fall"]).toMatchObject({
      narrativeMode: "rise-and-fall",
      mapDensity: "medium",
      timelineDensity: "high",
    });
  });

  it("requires a disclosure label for generated reconstructions", () => {
    const input = {
      approximatePeriod: "c. 1200 BCE",
      location: "Eastern Mediterranean",
      cultureOrPolity: "Late Bronze Age polities",
      subject: "A harbor under pressure",
      visualMode: "cinematic-reconstruction",
      framing: "wide establishing shot",
      shotPurpose: "explain maritime networks",
      prohibitedAnachronisms: ["modern ships"],
      reconstructionStatus: "evidence-backed-reconstruction",
    };
    expect(historyVisualPromptSchema.safeParse(input).success).toBe(false);
    expect(historyVisualPromptSchema.safeParse({ ...input, reconstructionLabel: "Evidence-backed reconstruction" }).success).toBe(true);
  });

  it("keeps modern borders explicitly orientational in map plans", () => {
    expect(historyMapPlanSchema.parse({
      id: "bronze-age-routes",
      phase: "Late Bronze Age trade",
      dateOrRange: "c. 1300 BCE",
      geographicExtent: "Eastern Mediterranean",
      entities: ["Mycenaean Greece", "Egypt"],
      accessibilityDescription: "Trade routes across the eastern Mediterranean.",
    }).modernBordersForOrientationOnly).toBe(false);
  });
});
