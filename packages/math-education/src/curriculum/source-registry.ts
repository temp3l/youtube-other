import fs from "node:fs/promises";
import { z } from "zod";
import {
  curriculumSourceSchema,
  statePlacementOverrideSchema,
  type CurriculumSkill,
} from "../domain/index.js";

export const sourceRegistrySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    sources: z.array(curriculumSourceSchema).min(1),
  })
  .superRefine((registry, context) => {
    const seen = new Set<string>();
    for (const source of registry.sources) {
      if (seen.has(source.id))
        context.addIssue({
          code: "custom",
          path: ["sources"],
          message: `Duplicate source id: ${source.id}`,
        });
      seen.add(source.id);
    }
  });

export const stateOverridesFileSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    reviewStatus: z.enum(["reviewed", "explicitly-incomplete"]),
    incompleteReason: z.string().min(1).optional(),
    overrides: z.array(statePlacementOverrideSchema),
  })
  .superRefine((file, context) => {
    if (file.reviewStatus === "explicitly-incomplete" && !file.incompleteReason)
      context.addIssue({
        code: "custom",
        path: ["incompleteReason"],
        message: "Incomplete override files require a reason.",
      });
  });

export async function loadSourceRegistry(filePath: string) {
  return sourceRegistrySchema.parse(
    JSON.parse(await fs.readFile(filePath, "utf8")) as unknown
  );
}

export function validateProvenance(
  skills: readonly CurriculumSkill[],
  registry: z.infer<typeof sourceRegistrySchema>,
  overrides: z.infer<typeof stateOverridesFileSchema>
): { complete: boolean; incompleteSkillIds: string[] } {
  const skillIds = new Set(skills.map((skill) => skill.skillId));
  const sources = new Map(
    registry.sources.map((source) => [source.id, source])
  );
  const incompleteSkillIds: string[] = [];
  for (const skill of skills) {
    let complete = true;
    for (const mapping of skill.sourceMappings) {
      const source = sources.get(mapping.sourceId);
      if (!source)
        throw new Error(
          `Unknown source ${mapping.sourceId} on ${skill.skillId}.`
        );
      if (mapping.reviewStatus !== "reviewed") complete = false;
      if (mapping.reviewStatus === "reviewed" && source.status === "unverified")
        throw new Error(
          `Reviewed mapping ${skill.skillId} uses unverified source ${source.id}.`
        );
    }
    if (
      !complete &&
      (skill.editorialStatus === "reviewed" ||
        skill.editorialStatus === "published")
    )
      throw new Error(
        `${skill.editorialStatus} skill ${skill.skillId} has incomplete provenance.`
      );
    if (!complete) incompleteSkillIds.push(skill.skillId);
  }
  for (const override of overrides.overrides) {
    if (!skillIds.has(override.skillId))
      throw new Error(`Unknown override skill ${override.skillId}.`);
    const source = sources.get(override.sourceMapping.sourceId);
    if (!source)
      throw new Error(
        `Unknown override source ${override.sourceMapping.sourceId}.`
      );
    if (
      override.binding === "binding" &&
      override.sourceMapping.reviewStatus !== "reviewed"
    ) {
      throw new Error(
        `Binding override ${override.overrideId} lacks reviewed provenance.`
      );
    }
    if (override.binding === "binding" && source.status === "unverified")
      throw new Error(
        `Binding override ${override.overrideId} uses unverified source ${source.id}.`
      );
  }
  return {
    complete: incompleteSkillIds.length === 0,
    incompleteSkillIds,
  };
}
