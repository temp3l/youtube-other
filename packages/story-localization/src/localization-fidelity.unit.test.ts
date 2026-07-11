import { describe, expect, it } from "vitest";
import { getLanguageProfile } from "./language-profiles.js";
import { validateLocalizationFidelity } from "./localization-fidelity.js";
import type { CanonicalStoryBeat, StoryMechanicsContract } from "./story-mechanics.js";

const beats: readonly CanonicalStoryBeat[] = Array.from({ length: 10 }, (_, index) => ({
  id: `beat-${String(index + 1).padStart(3, "0")}`,
  type: index === 0 ? "HOOK" : index === 8 ? "CLIMAX" : index === 9 ? "FINAL_REVERSAL" : "EVIDENCE",
  summary: `Scene ${index + 1}`,
  requiredFacts: [],
  requiredCharacters: index === 0 ? ["Clara"] : [],
  mechanicsReferences: [],
}));

const mechanics: StoryMechanicsContract = {
  centralThreat: "A voice in the walls",
  supernaturalRule: "Answering the voice lets it enter the next room.",
  ruleEvidence: ["The voice moved after Clara answered.", "The recorder answered and the locked door opened."],
  prohibitedActions: ["Do not answer the voice."],
  protagonistGoal: "Clara wants to save her sister.",
  emotionalStake: "Her sister is trapped behind the final door.",
  emotionalCost: "Clara must destroy her sister's last recording.",
  failedResponses: [{ action: "Clara sealed the vent.", failure: "The voice moved to the radio.", informationRevealed: "Silence, not distance, contains it." }],
  climaxAction: "Clara destroys the recording without answering.",
  climaxRuleConnection: "She uses silence to deny the voice entry.",
  finalConsequence: "Her sister's real voice disappears with the recording.",
};

function review(
  localizedNarration: string,
  preservedBeatIds: readonly string[] = beats.map((beat) => beat.id),
  requiredCharacterNames: readonly string[] = ["Clara"]
) {
  return validateLocalizationFidelity({
    sourceNarration: `Clara ${"source horror evidence ".repeat(391)}`,
    localizedNarration,
    sourceProfile: getLanguageProfile("en"),
    localizedProfile: getLanguageProfile("de"),
    requiredCharacterNames,
    canonicalBeats: beats,
    preservedBeatIds,
    mechanicsContract: mechanics,
    localizedMechanics: {
      supernaturalRule: "Wer der Stimme antwortet, lässt sie in den nächsten Raum.",
      emotionalCost: "Clara muss die letzte Aufnahme ihrer Schwester zerstören.",
      climaxRuleConnection: "Sie schweigt und verweigert der Stimme dadurch den Eintritt.",
      finalConsequence: "Mit der Aufnahme verschwindet auch die echte Stimme ihrer Schwester.",
    },
    sourceTitle: "The Voice in the Walls",
    localizedMetadata: {
      title: "Die Stimme in den Wänden",
      thumbnailText: "ANTWORTE NICHT",
      seoDescription: "Clara hört die Stimme ihrer Schwester hinter einer versiegelten Wand.",
      tags: ["Horror", "Stimme", "Spukhaus"],
      hashtags: ["#Horror"],
      contentDisclosure: "Fiktionalisierte Horrorgeschichte.",
    },
  });
}

describe("localization fidelity", () => {
  it("rejects a roughly 340-word localization of a roughly 1176-word source", () => {
    const result = review(`Clara ${"kurzes dunkles wort ".repeat(113)}`);
    expect(result.durationRatio).toBeLessThan(0.4);
    expect(result.issues.map((issue) => issue.code)).toContain("LOCALIZATION_SEVERE_ABRIDGEMENT");
    expect(result.repairStrategy).toBe("FULL_STAGE_REGENERATION");
  });

  it("uses semantic beat IDs instead of paragraph alignment", () => {
    const result = review(`Clara ${"öffnete die Tür und sah konkrete Spuren im dunklen Flur. ".repeat(105)}`);
    expect(result.sceneCoverageRatio).toBe(1);
    expect(result.missingSceneIds).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).not.toContain("LOCALIZATION_SCENE_COVERAGE_LOW");
  });

  it("rejects correct-length output that omits climax and final mechanics", () => {
    const base = review(`Clara ${"öffnete die Tür und sah konkrete Spuren im dunklen Flur. ".repeat(105)}`);
    const result = validateLocalizationFidelity({
      sourceNarration: `Clara ${"source horror evidence ".repeat(391)}`,
      localizedNarration: `Clara ${"öffnete die Tür und sah konkrete Spuren im dunklen Flur. ".repeat(105)}`,
      sourceProfile: getLanguageProfile("en"),
      localizedProfile: getLanguageProfile("de"),
      requiredCharacterNames: ["Clara"],
      canonicalBeats: beats,
      preservedBeatIds: base.preservedSceneIds,
      mechanicsContract: mechanics,
      localizedMetadata: { title: "Die Stimme", thumbnailText: "NICHT ANTWORTEN", seoDescription: "Eine lange Beschreibung.", tags: ["a", "b", "c"], hashtags: ["#Horror"], contentDisclosure: "Fiktion." },
    });
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["LOCALIZATION_MECHANICS_MISSING", "LOCALIZATION_CLIMAX_MECHANICS_MISSING", "LOCALIZATION_FINAL_CONSEQUENCE_MISSING"]));
  });

  it("rejects copied English production instructions", () => {
    const result = review(`Clara Speak in natural English. ${"öffnete die Tür und sah konkrete Spuren. ".repeat(140)}`);
    expect(result.issues.map((issue) => issue.code)).toContain("LOCALIZATION_ENGLISH_INSTRUCTION_LEAKAGE");
  });

  it("recognizes a required multi-word name next to punctuation", () => {
    const result = review(
      `Clara Vale, ${"öffnete die Tür und sah konkrete Spuren im dunklen Flur. ".repeat(105)}`,
      beats.map((beat) => beat.id),
      ["Clara Vale"]
    );
    expect(result.missingCharacters).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).not.toContain(
      "LOCALIZATION_CHARACTER_MISSING"
    );
  });
});
