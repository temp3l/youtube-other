import { describe, expect, it } from "vitest";
import type { Scene } from "@mediaforge/domain";
import { resolveHistorySceneImageGuidance } from "./history-image-plan.js";
import {
  buildHistorySceneSpace,
  renderHistoryImageProviderPrompt,
} from "./history-image-prompt.js";

const napoleonScene = {
  id: "scene-001",
  sequenceNumber: 1,
  canonicalNarration:
    "On June 24, 1812, soldiers began crossing the Niemen River into the Russian Empire.",
  sourceSegmentIds: ["scene-001"],
  estimatedDurationSeconds: 30,
  timing: { startSeconds: 0, endSeconds: 30 },
  visualPurpose: "Evidence-aware History documentary illustration.",
  subject: "On June 24, 1812, soldiers began crossing the Niemen River into the Russian Empire.",
  action: "depicts this distinct historical beat: soldiers crossed into Russia",
  setting: "1812; Russian Empire, Poland, Lithuania, Belarus",
  composition: "Landscape 16:9, one clear focal point, historically grounded material culture.",
  cameraFraming: "wide documentary shot",
  mood: "measured, evidence-led",
  continuityReferences: [],
  onScreenText: "",
  negativeConstraints: ["no watermark"],
  aspectRatios: ["16:9"],
  imagePrompt:
    "Historically grounded documentary reconstruction. Soldiers cross the Niemen River in 1812.",
  expectedImageFilenames: ["scene-001__000000-000030__16x9.png"],
  qualityStatus: "draft",
} as Scene;

describe("history image prompts", () => {
  it("builds period-aware scene space without horror placeholders", () => {
    const space = buildHistorySceneSpace({
      scene: napoleonScene,
      subject: napoleonScene.subject,
    });
    expect(space.foreground).toContain("river crossing");
    expect(space.background).not.toContain("unresolved environment");
    expect(space.foreground).not.toContain("nearest physical props");
  });

  it("renders history documentary prompts with scene-aware cinematography", () => {
    const prompt = renderHistoryImageProviderPrompt(
      {
        scene: {
          visibleAction: napoleonScene.action,
          focalSubject: napoleonScene.subject,
          environment: napoleonScene.setting,
          foreground: "soldiers at a river crossing",
          background: "open terrain beyond the river",
          shotSize: "wide",
          cameraAngle: "eye-level",
          composition: napoleonScene.composition,
          cameraFraming: "wide documentary shot",
          lighting: "moody cinematic lighting with restrained color",
          timeOfDay: "late evening",
          mood: napoleonScene.mood,
          distinctiveAnchor: "niemen river crossing 1812",
          continuityElements: [],
          prohibitedElements: ["no watermark"],
          textRequirement: { required: false },
          sourceNarration: napoleonScene.canonicalNarration,
        },
        aspectRatio: "16:9",
        authoritativeImagePrompt: napoleonScene.imagePrompt,
        characterContexts: [],
      },
      {
        skipIllustration: false,
        dominantModality: "archival image",
        overlappingBeatIds: ["beat-0002"],
        concept: {
          beatId: "beat-0002",
          historicalSubject: "Russia",
          intendedComposition: "River crossing orientation",
          protectedFactualRelation: "Soldiers crossed the Niemen River.",
          settingGeography: "Russia",
          approximatePeriod: "June 24, 1812",
          forbiddenAnachronisms: ["modern uniforms"],
          modality: "archival image",
        },
      }
    );

    expect(prompt).toContain("24-35mm environmental composition");
    expect(prompt).toContain("cinematic historical reconstruction");
    expect(prompt).toContain("grounded documentary realism");
    expect(prompt).toContain("Soldiers cross the Niemen River in 1812");
    expect(prompt).toContain("naturalistic directional daylight");
    expect(prompt).not.toContain("illustrative");
    expect(prompt).not.toContain("horror documentary");
    expect(prompt).not.toContain("altered family photograph");
    expect(prompt).not.toContain("moody cinematic lighting");
    expect(prompt).not.toContain("35mm/natural-light");
    expect(prompt).toContain("modern uniforms");
    expect(prompt.indexOf("PRIMARY VISUAL EVENT")).toBeLessThan(
      prompt.indexOf("VISUAL STYLE")
    );
  });

  it("marks map-only scene windows as skip illustration", () => {
    const guidance = resolveHistorySceneImageGuidance({
      plan: {
        beats: [
          {
            id: "beat-0001",
            modality: "map",
            startMs: 0,
            endMs: 10_000,
          },
        ],
        visualConcepts: [],
      },
      scene: {
        ...napoleonScene,
        timing: { startSeconds: 0, endSeconds: 8 },
      },
    });
    expect(guidance.skipIllustration).toBe(true);
  });
});
