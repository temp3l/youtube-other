import { hashText } from "@mediaforge/shared";
import {
  curriculumSeedSchema,
  curriculumSkillSchema,
  type CurriculumSkill,
} from "../domain/index.js";

const expectedCounts = new Map([
  [5, 37],
  [6, 34],
  [7, 36],
  [8, 36],
  [9, 33],
  [10, 30],
]);

export function readCurriculumSeed(markdown: string): unknown {
  const blocks = [...markdown.matchAll(/```json\s*\n([\s\S]*?)\n```/gu)];
  if (blocks.length !== 1)
    throw new Error(
      `Expected exactly one json code block, found ${blocks.length}.`
    );
  const content = blocks[0]?.[1];
  if (content === undefined) throw new Error("Curriculum JSON block is empty.");
  return JSON.parse(content) as unknown;
}

export function importCurriculumSeed(markdown: string): {
  skills: CurriculumSkill[];
  releaseHash: string;
} {
  const seed = curriculumSeedSchema.parse(readCurriculumSeed(markdown));
  const ids = new Set<string>();
  const counts = new Map<number, number>();
  const skills = seed.skills.map((skill, seedOrder) => {
    if (ids.has(skill.id)) throw new Error(`Duplicate skill id: ${skill.id}`);
    ids.add(skill.id);
    counts.set(skill.grade, (counts.get(skill.grade) ?? 0) + 1);
    return curriculumSkillSchema.parse({
      skillId: skill.id,
      canonicalGrade: skill.grade,
      domain: skill.domain,
      topic: skill.topic,
      learningObjective: skill.skill,
      placementConfidence: skill.placementConfidence,
      processCompetencies: ["REP"],
      sourceMappings: [
        {
          sourceId: "kmk-2022-math",
          section: "normalized synthesis",
          coverage: "synthesized",
          reviewStatus: "pending",
        },
      ],
      durationSeconds: skill.durationSeconds.target,
      allowedVariants: skill.variants,
      editorialStatus: "draft",
      prerequisiteIds: [],
      seedOrder,
    });
  });
  for (const [grade, expected] of expectedCounts) {
    if (counts.get(grade) !== expected)
      throw new Error(
        `Grade ${grade}: expected ${expected} skills, found ${counts.get(grade) ?? 0}.`
      );
  }
  if (skills.length !== 206)
    throw new Error(`Expected 206 skills, found ${skills.length}.`);
  const canonical = JSON.stringify({ schemaVersion: 1, skills });
  return { skills, releaseHash: hashText(canonical) };
}
