import { z } from "zod";
import { lessonVariantSchema, skillIdSchema } from "../domain/index.js";

const visualComponentSchema = z.enum([
  "formula",
  "place-value-chart",
  "fraction-model",
  "number-line",
  "coordinate-plane",
  "function-graph",
  "geometry",
  "measurement",
  "data-table",
  "probability-tree",
  "teacher",
]);

const exampleSchema = z.strictObject({
  value: z.string().regex(/^\d+$/u),
  parts: z.array(z.string().regex(/^\d+$/u)).min(2),
  prompt: z.string().min(1),
});

export const lessonSpecificationFixtureSchema = z.strictObject({
  skillId: skillIdSchema,
  variant: lessonVariantSchema,
  promise: z.string().min(1),
  targetAudience: z.string().min(1),
  examples: z.array(exampleSchema).min(1).max(2),
  challenge: exampleSchema.extend({
    reasoningSteps: z.array(z.string().min(1)).min(2).max(3),
  }),
  commonMistake: z.string().min(1),
  modelVisual: visualComponentSchema,
  practiceVisual: visualComponentSchema,
  sceneDurations: z.array(z.number().int().positive()).length(9),
});
export type LessonSpecificationFixture = z.infer<
  typeof lessonSpecificationFixtureSchema
>;

const profiles = {
  foundation: {
    promise: "Mit zwei geführten Beispielen sicher aufbauen",
    targetAudience: "Lernende mit hohem Strukturbedarf",
    sceneDurations: [20, 25, 40, 35, 25, 25, 45, 20, 5],
  },
  standard: {
    promise: "Selbstständig anwenden und begründen",
    targetAudience: "Lernende der Regelanforderungen",
    sceneDurations: [20, 20, 35, 30, 25, 30, 35, 25, 20],
  },
  challenge: {
    promise: "Eine neue Darstellung flexibel übertragen",
    targetAudience: "Lernende mit erweitertem Transferziel",
    sceneDurations: [15, 15, 25, 25, 20, 35, 30, 45, 30],
  },
} as const;

const domainFixtures = {
  "M5-ZO-001": {
    visuals: ["place-value-chart", "number-line", "formula"],
    mistakes: "Nullen zwischen besetzten Stellen werden ausgelassen.",
    variants: {
      foundation: {
        examples: [
          ["30405", ["30000", "400", "5"]],
          ["12030", ["10000", "2000", "30"]],
        ],
        challenge: ["50802", ["50000", "800", "2"]],
      },
      standard: {
        examples: [["730405", ["700000", "30000", "400", "5"]]],
        challenge: ["604070", ["600000", "4000", "70"]],
      },
      challenge: {
        examples: [["90730405", ["90000000", "700000", "30000", "400", "5"]]],
        challenge: ["63008009", ["60000000", "3000000", "8000", "9"]],
      },
    },
  },
  "M5-GM-002": {
    visuals: ["geometry", "measurement", "formula"],
    mistakes: "Beim Umfang werden nur zwei Seiten addiert.",
    variants: {
      foundation: {
        examples: [
          ["20", ["6", "4", "6", "4"]],
          ["18", ["5", "4", "5", "4"]],
        ],
        challenge: ["24", ["8", "4", "8", "4"]],
      },
      standard: {
        examples: [["26", ["8", "5", "8", "5"]]],
        challenge: ["32", ["9", "7", "9", "7"]],
      },
      challenge: {
        examples: [["38", ["12", "7", "12", "7"]]],
        challenge: ["46", ["15", "8", "15", "8"]],
      },
    },
  },
  "M5-DZ-001": {
    visuals: ["data-table", "formula", "data-table"],
    mistakes: "Ein Strichlistenblock aus fünf Strichen wird als vier gezählt.",
    variants: {
      foundation: {
        examples: [
          ["12", ["4", "3", "5"]],
          ["10", ["5", "2", "3"]],
        ],
        challenge: ["15", ["6", "2", "7"]],
      },
      standard: {
        examples: [["21", ["8", "6", "7"]]],
        challenge: ["24", ["9", "5", "10"]],
      },
      challenge: {
        examples: [["36", ["12", "9", "15"]]],
        challenge: ["42", ["14", "11", "17"]],
      },
    },
  },
} as const;

export const APPROVED_LESSON_SKILL_IDS = Object.freeze(
  Object.keys(domainFixtures)
) as readonly (keyof typeof domainFixtures)[];

export function reviewedLessonFixture(
  skillId: string,
  variant: z.infer<typeof lessonVariantSchema>
): LessonSpecificationFixture | null {
  if (!(skillId in domainFixtures)) return null;
  const domain = domainFixtures[skillId as keyof typeof domainFixtures];
  const profile = profiles[variant];
  const values = domain.variants[variant];
  const visualIndex =
    variant === "foundation" ? 0 : variant === "standard" ? 1 : 2;
  return lessonSpecificationFixtureSchema.parse({
    skillId,
    variant,
    promise: profile.promise,
    targetAudience: profile.targetAudience,
    examples: values.examples.map(([value, parts], index) => ({
      value,
      parts,
      prompt: `Bearbeite das geprüfte Beispiel ${index + 1}.`,
    })),
    challenge: {
      value: values.challenge[0],
      parts: values.challenge[1],
      prompt:
        variant === "challenge"
          ? "Übertrage das Verfahren auf die neue Darstellung."
          : "Löse die neue Aufgabe und prüfe dein Ergebnis.",
      reasoningSteps:
        variant === "challenge"
          ? ["Modell wählen", "Übertragen", "Ergebnis begründen"]
          : ["Modell anwenden", "Ergebnis prüfen"],
    },
    commonMistake: domain.mistakes,
    modelVisual: domain.visuals[visualIndex],
    practiceVisual: domain.visuals[(visualIndex + 1) % domain.visuals.length],
    sceneDurations: profile.sceneDurations,
  });
}
