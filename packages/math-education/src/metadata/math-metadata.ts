import { z } from "zod";
import {
  type CurriculumSkill,
  type LessonVariantSpecification,
  type MathLanguage,
} from "../domain/index.js";

export const mathMetadataSchema = z.strictObject({
  artifactVersion: z.literal("math-metadata.v1"),
  language: z.enum(["de", "en", "es", "fr", "pt"]),
  title: z.string().min(1).max(100),
  description: z.string().min(1),
  chapters: z
    .array(
      z.strictObject({
        seconds: z.number().nonnegative(),
        title: z.string().min(1),
      })
    )
    .min(3),
  tags: z.array(z.string().min(1)).min(3),
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}]+$/u)).min(2),
  thumbnail: z.strictObject({
    text: z.string().min(2),
    promise: z.string().min(1),
    formulaFactId: z.string(),
    profile: z.enum(["grades-5-7-v1", "grades-8-10-v1"]),
  }),
  playlists: z
    .array(
      z.strictObject({
        key: z.string(),
        kind: z.enum(["grade", "topic", "variant"]),
        localizedName: z.string(),
      })
    )
    .length(3),
});

export function generateMathMetadata(
  skill: CurriculumSkill,
  lesson: LessonVariantSpecification,
  language: MathLanguage
) {
  const labels = {
    de: "Stellenwerte verstehen",
    en: "Master Place Value",
    es: "Domina el valor posicional",
    fr: "Comprendre la numération",
    pt: "Domine o valor posicional",
  } as const;
  const grade = skill.canonicalGrade;
  const label = labels[language];
  return mathMetadataSchema.parse({
    artifactVersion: "math-metadata.v1",
    language,
    title: `${label} | Klasse ${grade} ${lesson.variant}`,
    description: `${lesson.promise}. Lernziel: ${lesson.learningObjective}. Mit Beispiel, Denkaufgabe und vollständiger Lösung.`,
    chapters: [
      { seconds: 0, title: "Start" },
      { seconds: 60, title: "Beispiel" },
      { seconds: 170, title: "Denkaufgabe" },
      { seconds: 215, title: "Lösung" },
    ],
    tags: ["Mathematik", `Klasse ${grade}`, skill.topic, lesson.variant],
    hashtags: ["#Mathematik", `#Klasse${grade}`],
    thumbnail: {
      text: label.split(" ").slice(0, 4).join(" "),
      promise: lesson.promise,
      formulaFactId: "example-number",
      profile: grade <= 7 ? "grades-5-7-v1" : "grades-8-10-v1",
    },
    playlists: [
      {
        key: `grade-${grade}`,
        kind: "grade",
        localizedName: `Klasse ${grade}`,
      },
      {
        key: `topic-${skill.topic.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`,
        kind: "topic",
        localizedName: skill.topic,
      },
      {
        key: `variant-${lesson.variant}`,
        kind: "variant",
        localizedName: lesson.variant,
      },
    ],
  });
}
