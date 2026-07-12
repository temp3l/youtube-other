import {
  type CurriculumSkill,
  type LessonVariant,
  type MathLanguage,
} from "../domain/index.js";
import { lessonCapability } from "../lesson/capabilities.js";
import { type MathBatchItem } from "./batch.js";

export interface MathBatchCapabilityExclusion {
  skillId: string;
  reason: "unsupported-skill" | "unsupported-variant";
}

export function planMathBatchItems(args: {
  skills: readonly CurriculumSkill[];
  variant: LessonVariant;
  language: MathLanguage;
}): {
  items: MathBatchItem[];
  excluded: MathBatchCapabilityExclusion[];
} {
  const items: MathBatchItem[] = [];
  const excluded: MathBatchCapabilityExclusion[] = [];
  for (const skill of args.skills) {
    const capability = lessonCapability(skill.skillId);
    if (!capability) {
      excluded.push({ skillId: skill.skillId, reason: "unsupported-skill" });
      continue;
    }
    if (!capability.variants.includes(args.variant)) {
      excluded.push({ skillId: skill.skillId, reason: "unsupported-variant" });
      continue;
    }
    items.push({
      skillId: skill.skillId,
      variant: args.variant,
      language: args.language,
      status: "planned",
      attempts: 0,
    });
  }
  return { items, excluded };
}
