import { describe, expect, it } from "vitest";
import {
  VERONICA_VISUAL_LANGUAGE,
  VERONICA_VISUAL_LANGUAGE_VERSION,
  buildLongFormChapters,
  buildVeronicaStoryBible,
  narrativeFunctionForStage,
  validateVeronicaVisualSequence,
  visibleThesisFor,
  visualFamilyFor,
} from "./veronica-visual-language.js";

const cleanScene = {
  sceneId: "l01-s03-hook",
  visibleThesis: "A buyer cannot say what the consultant is known for after the meeting ends.",
  newInformation: "Introduces the buyer consequence instead of a generic professional portrait.",
  narrativeFunction: "hook" as const,
  visualFamily: "human-decision" as const,
  narrationAnchor: "what people remember you for",
  treatment: {
    action: "buyer compares two occupation-neutral evidence summaries after an expert leaves",
    subjectRequirement: "buyer and independent expert",
    environment: "professional consultation room",
    props: ["text-free proposal evidence"],
  },
};

describe("canonical Veronica visual language", () => {
  it("projects one buyer-centric policy into both Short and long-form story bibles", () => {
    const short = buildVeronicaStoryBible({ format: "short", narration: "Remembered experts are chosen.", concepts: ["unclear association", "recall and choice"], parentLongFormId: "L01" });
    const long = buildVeronicaStoryBible({ format: "long", narration: "Remembered experts are chosen.", concepts: ["unclear association", "recall and choice"], parentLongFormId: "L01" });

    expect(short.version).toBe(VERONICA_VISUAL_LANGUAGE_VERSION);
    expect(long.version).toBe(short.version);
    expect(VERONICA_VISUAL_LANGUAGE).toMatchObject({ coreSubject: "buyer-psychology", literalBeforeMetaphor: true, occupationNeutralByDefault: true, buyerCentricByDefault: true });
    expect(short.preferredVisualFamilies).toEqual(long.preferredVisualFamilies);
    expect(short.forbiddenDrift).toEqual(long.forbiddenDrift);
    expect(short.continuityStrategy).toContain("causal");
    expect(long.continuityStrategy).toContain("chapter");
  });

  it("makes visible thesis, information gain, chapter arcs, and L01-S03 parent continuity deterministic", () => {
    const family = visualFamilyFor({ stage: "HOOK", concept: "buyer cannot recall an expert", diagram: false });
    expect(visibleThesisFor({ stage: "HOOK", concept: "buyer cannot recall an expert", family })).toMatch(/buyer/i);
    expect(narrativeFunctionForStage("PAYOFF")).toBe("payoff");
    const chapters = buildLongFormChapters({ contentId: "L01", sceneIds: ["cold-open", "v01", "v02", "v03", "v04", "v05"], concepts: ["confusion", "comparison", "evidence", "repetition", "recall", "recommendation"] });
    expect(chapters).toHaveLength(3);
    expect(chapters.at(-1)?.narrativeArc).toContain("recall");
    const failures = validateVeronicaVisualSequence({ scenes: [cleanScene, { ...cleanScene, sceneId: "l01-s03-payoff", visibleThesis: "The same buyer immediately recommends the specialist when a matching problem appears.", newInformation: "Shows recall becoming recommendation and selection.", narrativeFunction: "payoff", visualFamily: "social-perception" }], format: "short", chapters: [] });
    expect(failures).toEqual([]);
  });

  it("flags abstract props, occupation proxies, stock imagery, and decorative repetition only in strict semantic review", () => {
    const failures = validateVeronicaVisualSequence({
      scenes: [
        { ...cleanScene, treatment: { ...cleanScene.treatment, action: "stones sorted into boxes", props: ["stones", "boxes"] } },
        { ...cleanScene, sceneId: "proxy", narrationAnchor: "generic positioning expertise", treatment: { ...cleanScene.treatment, action: "ceramics consultant shows material samples", props: ["ceramic samples"] } },
        { ...cleanScene, sceneId: "stock", visibleThesis: "A professional looks at a screen.", treatment: { ...cleanScene.treatment, action: "woman staring at screen", props: [] } },
        { ...cleanScene, sceneId: "decorative", visibleThesis: cleanScene.visibleThesis, newInformation: "A different room repeats the same idea.", treatment: { ...cleanScene.treatment } },
      ],
      format: "short",
      chapters: [],
      strictSemanticGuards: true,
    });
    expect(failures.join(" ")).toContain("abstract-prop-drift");
    expect(failures.join(" ")).toContain("occupation-proxy-drift");
    expect(failures.join(" ")).toContain("generic-business-stock-drift");
    expect(failures.join(" ")).toContain("semantically-decorative-scene");
  });
});
