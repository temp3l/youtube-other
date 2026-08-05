import { describe, expect, it } from "vitest";

import {
  categoricalDatasetSchema,
  displayText,
  internalPlanningText,
  learnerNarrationCompilerInputSchema,
  learnerNarrationText,
  subtitleText,
  ttsText,
} from "./content-boundaries.js";

const tallyDataset = {
  title: "Lieblingsobst",
  context: "Zwölf Kinder wurden nach ihrem Lieblingsobst gefragt.",
  observations: ["Apfel", "Apfel", "Apfel", "Apfel", "Birne", "Birne", "Birne", "Banane", "Banane", "Banane", "Banane", "Banane"],
  frequencies: [
    { categoryId: "apfel", categoryLabel: "Apfel", frequency: 4 },
    { categoryId: "birne", categoryLabel: "Birne", frequency: 3 },
    { categoryId: "banane", categoryLabel: "Banane", frequency: 5 },
  ],
  total: 12,
  mostFrequentCategoryIds: ["banane"],
};

describe("math content boundaries", () => {
  it("creates branded, non-empty content-surface values", () => {
    expect(internalPlanningText("review state")).toBe("review state");
    expect(learnerNarrationText("Vier Kinder wählen Apfel.")).toBe("Vier Kinder wählen Apfel.");
    expect(displayText("Apfel: 4")).toBe("Apfel: 4");
    expect(ttsText("vier Kinder wählen Apfel")).toBe("vier Kinder wählen Apfel");
    expect(subtitleText("Vier Kinder wählen Apfel.")).toBe("Vier Kinder wählen Apfel.");
    expect(() => learnerNarrationText("  ")).toThrow();
  });

  it("derives total and most-frequent categories from frequencies", () => {
    expect(categoricalDatasetSchema.parse(tallyDataset)).toMatchObject({ total: 12 });
    expect(() => categoricalDatasetSchema.parse({ ...tallyDataset, total: 11 })).toThrow(/sum/u);
    expect(() => categoricalDatasetSchema.parse({ ...tallyDataset, mostFrequentCategoryIds: ["apfel"] })).toThrow(/ties/u);
    expect(categoricalDatasetSchema.parse({
      ...tallyDataset,
      observations: [...tallyDataset.observations, "Apfel"],
      frequencies: tallyDataset.frequencies.map((entry) => entry.categoryId === "apfel" ? { ...entry, frequency: 5 } : entry),
      total: 13,
      mostFrequentCategoryIds: ["apfel", "banane"],
    }).mostFrequentCategoryIds).toEqual(["apfel", "banane"]);
  });

  it("rejects duplicate categories and observations that are not represented", () => {
    expect(() => categoricalDatasetSchema.parse({
      ...tallyDataset,
      frequencies: [...tallyDataset.frequencies, { categoryId: "apfel", categoryLabel: "Anderer Apfel", frequency: 0 }],
    })).toThrow(/unique/u);
    expect(() => categoricalDatasetSchema.parse({
      ...tallyDataset,
      observations: [...tallyDataset.observations.slice(0, -1), "Kiwi"],
    })).toThrow(/Observations/u);
  });

  it("accepts only canonical semantics and didactic intent as compiler input", () => {
    const input = {
      locale: "de",
      grade: 5,
      canonicalDataset: tallyDataset,
      didacticIntent: {
        learningObjective: "Du erstellst eine Urliste und eine Strichliste.",
        explanationStrategy: "concrete-to-symbolic",
        workedExampleGoal: "Ordne Antworten den Kategorien zu.",
        guidedPracticeGoal: "Setze für jede Antwort einen Strich.",
        independentPracticeGoal: "Erstelle eine neue Strichliste.",
        retrievalQuestion: "Wozu hilft eine Fünfergruppe?",
        summaryRule: "Jede Antwort bekommt genau einen Strich.",
      },
      scenes: [{
        sceneId: "scene-worked-example",
        purpose: "worked-example",
        narration: "Bei Apfel stehen vier Striche.",
        displayText: "Apfel: 4",
        displayBindings: [{ kind: "category-frequency", categoryId: "apfel", frequency: 4 }],
      }],
    };
    expect(learnerNarrationCompilerInputSchema.parse(input).canonicalDataset.total).toBe(12);
    expect(() => learnerNarrationCompilerInputSchema.parse({ ...input, internalMetadata: { review: "verified" } })).toThrow();
  });

  it("requires a prompt and action for practice and an answer for solutions", () => {
    const base = {
      sceneId: "scene-practice",
      narration: "Zähle die Striche.",
      displayText: "Birne: 3",
      displayBindings: [{ kind: "category-frequency" as const, categoryId: "birne", frequency: 3 }],
    };
    expect(learnerNarrationCompilerInputSchema.safeParse({
      locale: "de", grade: 5, canonicalDataset: tallyDataset,
      didacticIntent: {
        learningObjective: "Listen verstehen.", explanationStrategy: "worked-example", workedExampleGoal: "Zählen.", guidedPracticeGoal: "Zählen.", independentPracticeGoal: "Übertragen.", retrievalQuestion: "Was ist eine Urliste?", summaryRule: "Striche zählen.",
      },
      scenes: [{ ...base, purpose: "guided-practice" }],
    }).success).toBe(false);
  });
});
