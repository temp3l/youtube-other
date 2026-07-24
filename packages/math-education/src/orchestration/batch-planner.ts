import {
  type CurriculumSkill,
  type LessonVariant,
  type MathLanguage,
} from "../domain/index.js";
import {
  lessonCapability,
  productionLessonCapability,
} from "../lesson/capabilities.js";
import { type MathBatchItem } from "./batch.js";

export interface MathBatchCapabilityExclusion {
  skillId: string;
  reason: "unsupported-skill" | "unsupported-variant";
}

export type MathBatchCapabilityMode =
  | "approved-simulation"
  | "private-production";

export function planMathBatchItems(args: {
  skills: readonly CurriculumSkill[];
  variant: LessonVariant;
  language: MathLanguage;
  capabilityMode?: MathBatchCapabilityMode;
}): {
  items: MathBatchItem[];
  excluded: MathBatchCapabilityExclusion[];
} {
  const items: MathBatchItem[] = [];
  const excluded: MathBatchCapabilityExclusion[] = [];
  for (const skill of args.skills) {
    const capability =
      args.capabilityMode === "private-production"
        ? productionLessonCapability(skill.skillId)
        : lessonCapability(skill.skillId);
    if (!capability) {
      excluded.push({ skillId: skill.skillId, reason: "unsupported-skill" });
      continue;
    }
    const variants: readonly LessonVariant[] = capability.variants;
    if (!variants.includes(args.variant)) {
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
