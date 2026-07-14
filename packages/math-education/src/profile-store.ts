import fs from "node:fs/promises";
import path from "node:path";

import { fileExists, writeJsonAtomic } from "@mediaforge/shared";
import {
  educationalVisualStyleManifestSchema,
  mathLessonProfileManifestSchema,
  type EducationalVisualStyleManifest,
  type MathLessonProfileManifest,
} from "./profile-contracts.js";
import { createMathTaskRegistry } from "./task-registry.js";
import {
  MATH_STAGES,
  workflowManifestSchema,
} from "./orchestration/workflow.js";

export const MATH_PROFILE_STORE_VERSION = "math.profile-store.v1" as const;
export const MATH_LEGACY_MIGRATION_VERSION =
  "math.legacy-migration.v1" as const;

export interface MathProfilePaths {
  readonly root: string;
  readonly lessonProfile: string;
  readonly visualStyle: string;
  readonly migrationStatus: string;
  readonly legacyWorkflow: string;
}

export function mathProfilePaths(unitRoot: string): MathProfilePaths {
  const resolved = path.resolve(unitRoot);
  const root = path.join(resolved, "state", "mathematics-profile");
  return {
    root,
    lessonProfile: path.join(root, "lesson-profile.json"),
    visualStyle: path.join(root, "educational-visual-style.json"),
    migrationStatus: path.join(root, "migration-status.json"),
    legacyWorkflow: path.join(resolved, "manifest.json"),
  };
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

async function parses(
  filePath: string,
  schema: {
    readonly safeParse: (value: unknown) => { readonly success: boolean };
  }
): Promise<boolean> {
  try {
    return schema.safeParse(await readJson(filePath)).success;
  } catch {
    return false;
  }
}

function downstream(taskId: string): readonly string[] {
  const registry = createMathTaskRegistry();
  return registry
    .list("mathematics-education")
    .filter((candidate) =>
      registry
        .explain(candidate.id)
        .transitiveDependencies.includes(taskId as never)
    )
    .map((candidate) => candidate.id)
    .sort();
}

export class MathProfileStore {
  public readonly paths: MathProfilePaths;

  public constructor(public readonly unitRoot: string) {
    this.paths = mathProfilePaths(unitRoot);
  }

  public async readLessonProfile(): Promise<MathLessonProfileManifest | null> {
    if (!(await fileExists(this.paths.lessonProfile))) return null;
    return mathLessonProfileManifestSchema.parse(
      await readJson(this.paths.lessonProfile)
    );
  }

  public async writeLessonProfile(input: unknown): Promise<{
    readonly manifest: MathLessonProfileManifest;
    readonly invalidatedTaskIds: readonly string[];
  }> {
    const manifest = mathLessonProfileManifestSchema.parse(input);
    const previous = await this.readLessonProfile();
    if (
      previous?.revision === manifest.revision &&
      previous.contentHash !== manifest.contentHash
    ) {
      throw new Error(
        `Mathematics profile revision ${manifest.revision} cannot be reused with another hash.`
      );
    }
    await writeJsonAtomic(this.paths.lessonProfile, manifest);
    const changed =
      !previous ||
      previous.revision !== manifest.revision ||
      previous.contentHash !== manifest.contentHash;
    return {
      manifest,
      invalidatedTaskIds: changed
        ? ["math.lesson-spec", ...downstream("math.lesson-spec")]
        : [],
    };
  }

  public async readVisualStyle(): Promise<EducationalVisualStyleManifest | null> {
    if (!(await fileExists(this.paths.visualStyle))) return null;
    return educationalVisualStyleManifestSchema.parse(
      await readJson(this.paths.visualStyle)
    );
  }

  public async writeVisualStyle(input: unknown): Promise<{
    readonly manifest: EducationalVisualStyleManifest;
    readonly invalidatedTaskIds: readonly string[];
  }> {
    const manifest = educationalVisualStyleManifestSchema.parse(input);
    const previous = await this.readVisualStyle();
    if (
      previous?.revision === manifest.revision &&
      previous.contentHash !== manifest.contentHash
    ) {
      throw new Error(
        `Educational visual-style revision ${manifest.revision} cannot be reused with another hash.`
      );
    }
    await writeJsonAtomic(this.paths.visualStyle, manifest);
    const changed =
      !previous ||
      previous.revision !== manifest.revision ||
      previous.contentHash !== manifest.contentHash;
    return {
      manifest,
      invalidatedTaskIds: changed
        ? ["math.visual-style", ...downstream("math.visual-style")]
        : [],
    };
  }
}

const stageToTask = {
  "curriculum-import": "math.curriculum-import",
  "source-validation": "math.source-validation",
  "prerequisite-graph": "math.prerequisite-graph",
  "lesson-spec": "math.lesson-spec",
  "math-verification": "math.math-verification",
  "canonical-narration": "math.canonical-narration",
  "scene-timing": "math.scene-timing",
  localization: "math.localization",
  "visual-assets": "math.visual-assets",
  tts: "math.tts",
  "timing-reflow": "math.timing-reflow",
  render: "math.render",
  "metadata-playlists": "math.metadata-playlists",
  "quality-gate": "math.quality-gate",
  publish: "math.publish-dry-run",
} as const satisfies Record<(typeof MATH_STAGES)[number], `math.${string}`>;

export interface LegacyMathMigrationEvidence {
  readonly schemaVersion: typeof MATH_LEGACY_MIGRATION_VERSION;
  readonly sourceVersion: "math-workflow.v2";
  readonly lessonId: string;
  readonly status: "reconciliation-required";
  readonly taskEvidence: readonly {
    readonly stage: (typeof MATH_STAGES)[number];
    readonly taskId: `math.${string}`;
    readonly status: "candidate" | "stale" | "blocked";
    readonly outputCount: number;
    readonly reasons: readonly string[];
  }[];
  readonly actions: readonly string[];
}

/**
 * Convert v2 lineage to reconciliation candidates. Imported records are never
 * promoted to shared-engine success without canonical output verification.
 */
export function adaptLegacyMathWorkflowManifest(
  input: unknown
): LegacyMathMigrationEvidence {
  if (JSON.stringify(input).includes("math-verifier.v2")) {
    throw new Error(
      "Legacy math-verifier.v2 lineage is unsupported and must be regenerated with math-verifier.v3."
    );
  }
  const manifest = workflowManifestSchema.parse(input);
  return {
    schemaVersion: MATH_LEGACY_MIGRATION_VERSION,
    sourceVersion: manifest.artifactVersion,
    lessonId: manifest.lessonId,
    status: "reconciliation-required",
    taskEvidence: manifest.stages.map((stage) => {
      const reusableStatus = ["succeeded", "cached"].includes(stage.status);
      const currentSchemas = stage.outputArtifacts.every(
        (artifact) => artifact.schemaVersion !== "math-narration.v1"
      );
      const reasons = [
        ...(!reusableStatus
          ? [`Legacy stage status ${stage.status} is not reusable.`]
          : []),
        ...(stage.outputArtifacts.length === 0
          ? ["Legacy stage has no output lineage to reconcile."]
          : []),
        ...(!currentSchemas
          ? ["Legacy narration schema requires regeneration."]
          : []),
        "Shared-engine artifact verification and reconciliation are required.",
      ];
      return {
        stage: stage.stage,
        taskId: stageToTask[stage.stage],
        status: !reusableStatus
          ? ("blocked" as const)
          : stage.outputArtifacts.length > 0 && currentSchemas
            ? ("candidate" as const)
            : ("stale" as const),
        outputCount: stage.outputArtifacts.length,
        reasons,
      };
    }),
    actions: [
      "Verify every candidate output through the canonical artifact repository.",
      "Reconcile verified candidates into shared-engine events; regenerate stale or unsupported stages.",
      "Keep the v2 manifest read-only until caller migration is accepted.",
    ],
  };
}

export interface MathMigrationStatus {
  readonly schemaVersion: typeof MATH_PROFILE_STORE_VERSION;
  readonly status: "ready" | "migration-required";
  readonly lessonProfilePresent: boolean;
  readonly lessonProfileValid: boolean;
  readonly visualStylePresent: boolean;
  readonly visualStyleValid: boolean;
  readonly legacyWorkflowPresent: boolean;
  readonly legacyEvidence: LegacyMathMigrationEvidence | null;
  readonly blockers: readonly string[];
  readonly actions: readonly string[];
  readonly inspectedAt: string;
}

export async function inspectMathMigrationStatus(
  unitRoot: string,
  now: () => Date = () => new Date()
): Promise<MathMigrationStatus> {
  const store = new MathProfileStore(unitRoot);
  const lessonProfilePresent = await fileExists(store.paths.lessonProfile);
  const visualStylePresent = await fileExists(store.paths.visualStyle);
  const lessonProfileValid = lessonProfilePresent
    ? await parses(store.paths.lessonProfile, mathLessonProfileManifestSchema)
    : false;
  const visualStyleValid = visualStylePresent
    ? await parses(
        store.paths.visualStyle,
        educationalVisualStyleManifestSchema
      )
    : false;
  const legacyWorkflowPresent = await fileExists(store.paths.legacyWorkflow);
  let legacyEvidence: LegacyMathMigrationEvidence | null = null;
  const blockers: string[] = [];
  const actions: string[] = [];
  if (!lessonProfileValid) {
    blockers.push(
      lessonProfilePresent
        ? "MATH_LESSON_PROFILE_INVALID"
        : "MATH_LESSON_PROFILE_MISSING"
    );
    actions.push(
      lessonProfilePresent
        ? "Repair the invalid lesson profile without reusing its revision for changed content."
        : "Create and approve a curriculum-bound mathematics lesson profile."
    );
  }
  if (!visualStyleValid) {
    blockers.push(
      visualStylePresent
        ? "MATH_VISUAL_STYLE_INVALID"
        : "MATH_VISUAL_STYLE_MISSING"
    );
    actions.push(
      visualStylePresent
        ? "Repair the invalid educational visual-style manifest and obtain revision-bound approval."
        : "Create, validate, and approve an educational visual-style manifest."
    );
  }
  if (legacyWorkflowPresent) {
    try {
      legacyEvidence = adaptLegacyMathWorkflowManifest(
        await readJson(store.paths.legacyWorkflow)
      );
      actions.push(...legacyEvidence.actions);
    } catch (error) {
      blockers.push("MATH_LEGACY_LINEAGE_UNSUPPORTED");
      actions.push(error instanceof Error ? error.message : String(error));
    }
  }
  const result: MathMigrationStatus = {
    schemaVersion: MATH_PROFILE_STORE_VERSION,
    status: blockers.length === 0 ? "ready" : "migration-required",
    lessonProfilePresent,
    lessonProfileValid,
    visualStylePresent,
    visualStyleValid,
    legacyWorkflowPresent,
    legacyEvidence,
    blockers,
    actions,
    inspectedAt: now().toISOString(),
  };
  await writeJsonAtomic(store.paths.migrationStatus, result);
  return result;
}
