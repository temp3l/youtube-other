import { z } from "zod";
import { lessonVariantSchema, skillIdSchema } from "../domain/index.js";
import { APPROVED_LESSON_SKILL_IDS } from "./lesson-specification-fixtures.js";

const lessonCapabilitySchema = z.strictObject({
  skillId: skillIdSchema,
  status: z.literal("approved-simulation"),
  variants: z.array(lessonVariantSchema).length(3),
  producerVersion: z.literal("reviewed-fixtures.v1"),
});

const capabilities = new Map<string, z.infer<typeof lessonCapabilitySchema>>(
  APPROVED_LESSON_SKILL_IDS.map((skillId) => [
    skillId,
    lessonCapabilitySchema.parse({
      skillId,
      status: "approved-simulation",
      variants: ["foundation", "standard", "challenge"],
      producerVersion: "reviewed-fixtures.v1",
    }),
  ])
);

export function lessonCapability(skillId: string) {
  return capabilities.get(skillId) ?? null;
}

export function assertLessonCapability(
  skillId: string,
  variant: z.infer<typeof lessonVariantSchema>
): void {
  const capability = lessonCapability(skillId);
  if (!capability || !capability.variants.includes(variant))
    throw new Error(
      `Lesson capability is not approved for ${skillId}/${variant}.`
    );
}
