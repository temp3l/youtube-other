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
  const copy = {
    de: {
      grade: "Klasse",
      start: "Start",
      example: "Beispiel",
      challenge: "Denkaufgabe",
      solution: "Lösung",
      math: "Mathematik",
      description:
        "Mit geprüftem Beispiel, Denkaufgabe und vollständiger Lösung.",
      promise: "Verstehen, anwenden und prüfen",
      variants: {
        foundation: "Grundlage",
        standard: "Standard",
        challenge: "Herausforderung",
      },
    },
    en: {
      grade: "Grade",
      start: "Start",
      example: "Example",
      challenge: "Challenge",
      solution: "Solution",
      math: "Mathematics",
      description:
        "Includes a verified example, challenge, and complete solution.",
      promise: "Understand, apply, and verify",
      variants: {
        foundation: "Foundation",
        standard: "Standard",
        challenge: "Challenge",
      },
    },
    es: {
      grade: "Grado",
      start: "Inicio",
      example: "Ejemplo",
      challenge: "Reto",
      solution: "Solución",
      math: "Matemáticas",
      description:
        "Incluye un ejemplo verificado, un reto y la solución completa.",
      promise: "Comprender, aplicar y comprobar",
      variants: {
        foundation: "Fundamentos",
        standard: "Estándar",
        challenge: "Desafío",
      },
    },
    fr: {
      grade: "Classe",
      start: "Début",
      example: "Exemple",
      challenge: "Défi",
      solution: "Solution",
      math: "Mathématiques",
      description: "Avec un exemple vérifié, un défi et sa solution complète.",
      promise: "Comprendre, appliquer et vérifier",
      variants: {
        foundation: "Fondation",
        standard: "Standard",
        challenge: "Défi",
      },
    },
    pt: {
      grade: "Ano",
      start: "Início",
      example: "Exemplo",
      challenge: "Desafio",
      solution: "Solução",
      math: "Matemática",
      description: "Inclui exemplo verificado, desafio e solução completa.",
      promise: "Compreender, aplicar e conferir",
      variants: {
        foundation: "Fundamentos",
        standard: "Padrão",
        challenge: "Desafio",
      },
    },
  } as const;
  const topicLabels: Record<string, Record<MathLanguage, string>> = {
    "M5-ZO-001": {
      de: "Stellenwerte verstehen",
      en: "Master Place Value",
      es: "Domina el valor posicional",
      fr: "Comprendre la numération",
      pt: "Domine o valor posicional",
    },
    "M5-GM-002": {
      de: "Umfang berechnen",
      en: "Calculate Perimeter",
      es: "Calcula el perímetro",
      fr: "Calculer le périmètre",
      pt: "Calcule o perímetro",
    },
    "M5-DZ-001": {
      de: "Strichlisten auswerten",
      en: "Read Tally Charts",
      es: "Interpreta tablas de conteo",
      fr: "Lire un tableau de comptage",
      pt: "Leia tabelas de contagem",
    },
  };
  const grade = skill.canonicalGrade;
  const locale = copy[language];
  const label = topicLabels[skill.skillId]?.[language];
  if (!label)
    throw new Error(
      `No localized metadata topic for ${skill.skillId}/${language}.`
    );
  const variantLabel = locale.variants[lesson.variant];
  return mathMetadataSchema.parse({
    artifactVersion: "math-metadata.v1",
    language,
    title: `${label} | ${locale.grade} ${grade} ${variantLabel}`,
    description: `${locale.promise}. ${locale.description}`,
    chapters: [
      { seconds: 0, title: locale.start },
      { seconds: 60, title: locale.example },
      { seconds: 170, title: locale.challenge },
      { seconds: 215, title: locale.solution },
    ],
    tags: [locale.math, `${locale.grade} ${grade}`, label, variantLabel],
    hashtags: [`#${locale.math}`, `#${locale.grade}${grade}`],
    thumbnail: {
      text: label.split(" ").slice(0, 4).join(" "),
      promise: locale.promise,
      formulaFactId: "example-number",
      profile: grade <= 7 ? "grades-5-7-v1" : "grades-8-10-v1",
    },
    playlists: [
      {
        key: `grade-${grade}`,
        kind: "grade",
        localizedName: `${locale.grade} ${grade}`,
      },
      {
        key: `topic-${skill.topic.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`,
        kind: "topic",
        localizedName: label,
      },
      {
        key: `variant-${lesson.variant}`,
        kind: "variant",
        localizedName: variantLabel,
      },
    ],
  });
}
