import { z } from "zod";

export const educationalGradeBandSchema = z.enum([
  "grades-5-6",
  "grades-7-8",
  "grades-9-10",
]);

export const educationalGradeProfileSchema = z.strictObject({
  band: educationalGradeBandSchema,
  grades: z.tuple([z.number().int(), z.number().int()]),
  maximumSentenceWords: z.number().int().positive(),
  maximumNewConceptsPerScene: z.number().int().positive(),
  vocabularyLevel: z.enum(["concrete", "mixed", "technical"]),
  explanationDensity: z.enum(["spaced", "balanced", "compact"]),
  abstraction: z.enum(["concrete", "representational", "symbolic"]),
  preferredExampleContexts: z.array(z.string().min(1)).min(1),
  defaultThinkingPauseSeconds: z.number().int().positive(),
  requiredExplanationDepth: z.enum(["rule-with-example", "reasoned-procedure", "justified-transfer"]),
});

export type EducationalGradeProfile = z.infer<typeof educationalGradeProfileSchema>;

const profiles = [
  {
    band: "grades-5-6",
    grades: [5, 6] as const,
    maximumSentenceWords: 14,
    maximumNewConceptsPerScene: 2,
    vocabularyLevel: "concrete",
    explanationDensity: "spaced",
    abstraction: "concrete",
    preferredExampleContexts: ["Klasse", "Alltag", "Spiel", "Umfrage"],
    defaultThinkingPauseSeconds: 8,
    requiredExplanationDepth: "rule-with-example",
  },
  {
    band: "grades-7-8",
    grades: [7, 8] as const,
    maximumSentenceWords: 18,
    maximumNewConceptsPerScene: 3,
    vocabularyLevel: "mixed",
    explanationDensity: "balanced",
    abstraction: "representational",
    preferredExampleContexts: ["Alltag", "Messung", "Modell", "Sport"],
    defaultThinkingPauseSeconds: 10,
    requiredExplanationDepth: "reasoned-procedure",
  },
  {
    band: "grades-9-10",
    grades: [9, 10] as const,
    maximumSentenceWords: 22,
    maximumNewConceptsPerScene: 4,
    vocabularyLevel: "technical",
    explanationDensity: "compact",
    abstraction: "symbolic",
    preferredExampleContexts: ["Modell", "Daten", "Technik", "Finanzen"],
    defaultThinkingPauseSeconds: 12,
    requiredExplanationDepth: "justified-transfer",
  },
] as const;

export function educationalGradeProfile(grade: number): EducationalGradeProfile {
  const profile = profiles.find(({ grades }) => grade >= grades[0] && grade <= grades[1]);
  if (!profile) throw new Error(`No educational grade profile exists for grade ${grade}.`);
  return educationalGradeProfileSchema.parse(profile);
}
