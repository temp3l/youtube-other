import type { TaskFingerprintMaterial } from "@mediaforge/workflow-engine";

import type {
  EducationalVisualStyleManifest,
  MathLessonProfileManifest,
} from "./profile-contracts.js";
import { MATH_TASK_IDS, createMathTaskRegistry } from "./task-registry.js";

/** Bind curriculum, lesson-profile, verification, and visual policy revisions. */
export function createMathFingerprintMaterial(input: {
  readonly profile: MathLessonProfileManifest | null;
  readonly visualStyle: EducationalVisualStyleManifest | null;
  readonly curriculum?: {
    readonly releaseId: string;
    readonly revision: string;
    readonly releaseHash: string;
    readonly authorityHash: string;
  };
  readonly selection?: {
    readonly skillId: string;
    readonly locale: string;
    readonly contentVariant: string;
    readonly lessonVariant: string;
  };
  readonly profileRevision?: string;
  readonly visualStyleRevision?: string;
  readonly verifierVersion?: string;
  readonly rendererVersions?: Readonly<Record<string, string>>;
  readonly providerConfiguration?: unknown;
}): Readonly<Record<string, TaskFingerprintMaterial>> {
  const registry = createMathTaskRegistry();
  const material: Record<string, TaskFingerprintMaterial> = {};
  for (const taskId of MATH_TASK_IDS) {
    const explanation = registry.explain(taskId);
    const visualBound =
      taskId === "math.visual-style" ||
      taskId === "math.visual-assets" ||
      explanation.transitiveDependencies.includes("math.visual-style" as never);
    const verificationBound =
      taskId === "math.math-verification" ||
      explanation.transitiveDependencies.includes(
        "math.math-verification" as never
      );
    material[taskId] = {
      ...(input.profile
        ? {
            profile: {
              contractVersion: input.profile.contractVersion,
              profileRevision: input.profile.revision,
              contentHash: input.profile.contentHash,
              outputAudience: input.profile.outputAudience,
              contentVariant: input.profile.contentVariant,
              lessonVariant: input.profile.lessonVariant,
            },
            curriculumRevision: input.profile.curriculum.revision,
            configuration: {
              jurisdiction: input.profile.jurisdiction,
              stateOrRegion: input.profile.stateOrRegion,
              schoolType: input.profile.curriculum.schoolType,
              grade: input.profile.curriculum.grade,
              locale: input.profile.locale,
              lessonLengthSeconds: input.profile.lessonLengthSeconds,
              accessibilityNeeds: input.profile.audience.accessibilityNeeds,
            },
            additional: {
              curriculumReleaseId: input.profile.curriculum.releaseId,
              curriculumReleaseHash: input.profile.curriculum.releaseHash,
              skillId: input.profile.skillId,
              learningObjective: input.profile.learningObjective,
              prerequisites: input.profile.prerequisiteSkillIds,
            },
          }
        : {}),
      ...(!input.profile && (input.profileRevision || input.selection)
        ? {
            profile: {
              profileRevision: input.profileRevision ?? "unavailable",
              ...(input.selection ?? {}),
            },
          }
        : {}),
      ...(input.curriculum
        ? {
            curriculumRevision: input.curriculum.revision,
            additional: {
              ...(input.profile
                ? {
                    curriculumReleaseId: input.profile.curriculum.releaseId,
                    curriculumReleaseHash: input.profile.curriculum.releaseHash,
                    skillId: input.profile.skillId,
                    learningObjective: input.profile.learningObjective,
                    prerequisites: input.profile.prerequisiteSkillIds,
                  }
                : input.selection
                  ? { skillId: input.selection.skillId }
                  : {}),
              authoritativeCurriculum: input.curriculum,
            },
          }
        : {}),
      ...(visualBound && input.visualStyle
        ? {
            visualStyleRevision: input.visualStyle.revision,
            renderer: {
              manifestVersions: input.visualStyle.rendererVersions,
              runtimeVersions:
                input.rendererVersions ?? input.visualStyle.rendererVersions,
            },
          }
        : {}),
      ...(visualBound && !input.visualStyle && input.visualStyleRevision
        ? {
            visualStyleRevision: input.visualStyleRevision,
            renderer: {
              runtimeVersions: input.rendererVersions ?? {},
            },
          }
        : {}),
      ...(verificationBound
        ? {
            tools: {
              verifierVersion: input.verifierVersion ?? "math-verifier.v3",
              unsupportedVerificationPolicy: "block",
            },
          }
        : {}),
      ...(taskId === "math.tts" ||
      explanation.transitiveDependencies.includes("math.tts" as never)
        ? { provider: input.providerConfiguration ?? { authorized: false } }
        : {}),
    };
  }
  return material;
}
