import { z } from "zod";

export const MATH_LANGUAGES = ["de", "en", "es", "fr", "pt"] as const;
export const MATH_VARIANTS = ["foundation", "standard", "challenge"] as const;
export const MATH_GRADES = [5, 6, 7, 8, 9, 10] as const;

export const mathLanguageSchema = z.enum(MATH_LANGUAGES);
export const lessonVariantSchema = z.enum(MATH_VARIANTS);
export const mathGradeSchema = z.union(
  MATH_GRADES.map((grade) => z.literal(grade))
);
export const skillIdSchema = z
  .string()
  .regex(/^M(?:5|6|7|8|9|10)-[A-Z]{2}-\d{3}$/u);
export const lessonIdSchema = z
  .string()
  .regex(
    /^m(?:5|6|7|8|9|10)-[a-z]{2}-\d{3}-(?:foundation|standard|challenge)$/u
  );
export const factIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export type MathLanguage = z.infer<typeof mathLanguageSchema>;
export type LessonVariant = z.infer<typeof lessonVariantSchema>;
export type MathGrade = z.infer<typeof mathGradeSchema>;

export function createLessonId(
  skillId: string,
  variant: LessonVariant
): string {
  return lessonIdSchema.parse(`${skillId.toLowerCase()}-${variant}`);
}
