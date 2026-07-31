import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ARTIFACT_SCHEMA_VERSION,
  PROFILE_SCHEMA_VERSION,
} from "@mediaforge/domain";
import { createTaskRegistry } from "@mediaforge/workflow-engine";
import { describe, expect, it } from "vitest";

import { createMathFingerprintMaterial } from "./profile-bindings.js";
import {
  assessEducationalVisualStyleReadiness,
  assessMathLessonProfileReadiness,
  educationalVisualStyleManifestSchema,
  mathLessonProfileManifestSchema,
  type EducationalVisualStyleManifest,
  type MathLessonProfileManifest,
} from "./profile-contracts.js";
import { runMathProfileDeterministicFixture } from "./profile-fixture.js";
import {
  MATH_PROFILE_QUALITY_DIMENSIONS,
  buildMathProfileQualityAssessment,
  evaluateMathProductionGates,
  mathHardFailures,
  type MathHardFailureEvidence,
} from "./profile-quality.js";
import { deriveMathWorkflowState } from "./profile-state.js";
import {
  MathProfileStore,
  adaptLegacyMathWorkflowManifest,
  inspectMathMigrationStatus,
} from "./profile-store.js";
import {
  MATH_STAGES,
  type WorkflowManifest,
} from "./orchestration/workflow.js";
import { runPilotSimulation } from "./orchestration/pilot-simulation.js";
import { createReviewedCurriculumFixture } from "./testing/reviewed-curriculum-fixture.js";
import { MATH_TASK_IDS, createMathTaskRegistrations } from "./task-registry.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const NOW = "2026-07-14T10:00:00.000Z";
const FUTURE = "2027-07-14T10:00:00.000Z";

function approval(revision: string, contentHash = HASH_A) {
  return {
    decision: "approved" as const,
    actor: "reviewer@example.test",
    reason: "Reviewed against the mathematics education profile.",
    createdAt: NOW,
    expiresAt: FUTURE,
    boundRevision: revision,
    contentHash,
  };
}

function lessonProfile(): MathLessonProfileManifest {
  return mathLessonProfileManifestSchema.parse({
    schemaVersion: "math.profile-manifest.v1",
    contractVersion: "math.profile.v1",
    profileId: "mathematics-education",
    revision: "lesson-profile-r1",
    contentHash: HASH_A,
    createdAt: NOW,
    updatedAt: NOW,
    lessonId: "m5-zo-001-standard",
    skillId: "M5-ZO-001",
    lessonVariant: "standard",
    contentVariant: "full",
    outputAudience: "student",
    locale: "en",
    jurisdiction: "DE",
    stateOrRegion: "DE-NW",
    curriculum: {
      sourceId: "de-nw-source",
      releaseId: "de-gems-5-10-v1",
      revision: "curriculum-r1",
      releaseHash: HASH_B,
      status: "reviewed",
      schoolType: "Gesamtschule",
      grade: 5,
      sourceUrls: ["https://example.test/curriculum"],
      reviewedAt: NOW,
    },
    audience: {
      ageMinimum: 10,
      ageMaximum: 12,
      priorKnowledge: ["Place-value vocabulary"],
      accessibilityNeeds: ["Color-independent meaning", "Persistent labels"],
      languageLevel: "grade-appropriate",
    },
    lessonLengthSeconds: 240,
    learningObjective: "Decompose whole numbers by place value.",
    prerequisiteSkillIds: [],
    misconceptionInventory: ["Internal zeroes may be omitted."],
    pedagogicalStrategy: ["Concrete to symbolic progression"],
    deterministicVerificationRequired: true,
    profile: {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      contractVersion: "1.0.0",
      id: "mathematics-education",
      audience: {
        ageMinimum: 10,
        ageMaximum: 12,
        description: "Grade five learners",
        priorKnowledge: ["Place value"],
        accessibilityNeeds: ["Color-independent meaning"],
      },
      objective: "Build verified mathematical understanding.",
      engagementStrategies: ["Achievable challenge", "Visual understanding"],
      qualityPolicies: [{ id: "math.quality", version: "r1" }],
      visualPolicy: { id: "math.visual", version: "r1" },
      narrationPolicy: { id: "math.narration", version: "r1" },
      localizationPolicy: { id: "math.localization", version: "r1" },
      approvalPolicy: { id: "math.approval", version: "r1" },
      artifactRequirements: [{ id: "math.artifacts", version: "r1" }],
      referencePolicy: { id: "math.references-optional", version: "r1" },
      curriculumJurisdiction: "DE-NW",
      curriculumRevision: "curriculum-r1",
      grade: 5,
      deterministicVerificationRequired: true,
    },
    approval: approval("lesson-profile-r1"),
  });
}

function visualStyle(): EducationalVisualStyleManifest {
  return educationalVisualStyleManifestSchema.parse({
    schemaVersion: "math.educational-visual-style.v1",
    profileId: "mathematics-education",
    revision: "visual-r1",
    profileRevision: "lesson-profile-r1",
    curriculumRevision: "curriculum-r1",
    contentHash: HASH_A,
    createdAt: NOW,
    updatedAt: NOW,
    canvas: {
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
      layoutTemplates: ["worked-example"],
    },
    typography: {
      textFontFamily: "MathText",
      mathFontFamily: "MathFormula",
      fontMetricsRevision: "metrics-r1",
      minimumVisibleFontPx: 48,
      minimumCaptionFontPx: 42,
    },
    palette: {
      colors: { primary: "#123456", accent: "#abcdef" },
      semanticEncodings: [
        {
          meaning: "current transformation step",
          colorToken: "accent",
          colorIndependentCue: "solid outline and step number",
        },
      ],
    },
    rules: {
      diagrams: ["Bind every displayed quantity to a verified fact."],
      graphs: ["Label both axes and units."],
      coordinateSystems: ["Show origin and scale."],
      geometry: ["Label non-scale drawings."],
      symbolicRendering: ["Preserve verified equivalence."],
      notToScaleLabelRequired: true,
    },
    animation: {
      minimumStepDurationMs: 800,
      maximumStepDurationMs: 5000,
      transformationConvention: "Keep prior step visible until replacement.",
      transientMeaningRequiresPersistentEquivalent: true,
    },
    safeRegions: {
      captions: { x: 96, y: 800, width: 1728, height: 180 },
      accessibility: { x: 96, y: 54, width: 1728, height: 900 },
    },
    rendererVersions: { svg: "renderer-r1", formula: "katex-r1" },
    references: [],
    localeVisibleLabels: [
      {
        locale: "en",
        policyRevision: "labels-r1",
        decimalSeparator: "point",
        labelsLocalized: true,
        mathematicalSemanticsLocked: true,
      },
    ],
    validation: {
      status: "passed",
      checkedAt: NOW,
      checks: [
        { id: "readability", status: "passed", evidence: "48px minimum" },
        {
          id: "color-independent",
          status: "passed",
          evidence: "Every color token has a persistent non-color cue.",
        },
      ],
      issues: [],
    },
    approval: approval("visual-r1"),
  });
}

function passingEvidence(): MathHardFailureEvidence {
  return {
    statementCorrect: true,
    workedSolutionsValid: true,
    symbolicResultsVerified: true,
    curriculumAligned: true,
    prerequisitesPresent: true,
    visualSemanticsAccurate: true,
    essentialInformationAccessible: true,
    exercisesTeachableFromLesson: true,
    answerKeyMatches: true,
    learningClaimsSupported: true,
    evidence: ["deterministic fixture evidence"],
  };
}

function legacyManifest(): WorkflowManifest {
  let preceding: string | undefined;
  return {
    artifactVersion: "math-workflow.v2",
    lessonId: "m5-zo-001-standard",
    curriculumReleaseId: "de-gems-5-10-v1",
    simulated: true,
    paidProviderCalled: false,
    stages: MATH_STAGES.map((stage, index) => {
      const fingerprint = String(index + 1).padStart(64, "0");
      const record = {
        stage,
        status: "succeeded" as const,
        fingerprint,
        parentFingerprints: preceding ? [preceding] : [],
        outputArtifacts: [],
        updatedAt: NOW,
      };
      preceding = fingerprint;
      return record;
    }),
    failures: [],
  };
}

describe("mathematics profile integration", () => {
  it("enforces curriculum, audience, approval, and accessible visual contracts", () => {
    const profile = lessonProfile();
    const style = visualStyle();
    expect(assessMathLessonProfileReadiness(profile, new Date(NOW)).ready).toBe(
      true
    );
    expect(
      assessEducationalVisualStyleReadiness(style, "en", new Date(NOW)).ready
    ).toBe(true);
    expect(
      assessEducationalVisualStyleReadiness(style, "de", new Date(NOW)).reasons
    ).toContain("No visible-label policy exists for locale de.");
    expect(
      mathLessonProfileManifestSchema.safeParse({
        ...profile,
        curriculum: { ...profile.curriculum, status: "draft" },
      }).success
    ).toBe(false);
    expect(
      educationalVisualStyleManifestSchema.safeParse({
        ...style,
        references: [
          {
            id: "teacher",
            revision: "teacher-r1",
            role: "teacher",
            required: true,
            relativePath: "references/teacher.png",
            checksumSha256: HASH_B,
            license: "fixture",
            provenance: "fixture",
          },
        ],
      }).success
    ).toBe(false);
  });

  it("binds profile revisions and blocks visual tasks without approved style evidence", () => {
    const profile = lessonProfile();
    const style = visualStyle();
    const material = createMathFingerprintMaterial({
      profile,
      visualStyle: style,
      rendererVersions: { svg: "renderer-r1", formula: "katex-r1" },
      providerConfiguration: {
        presetId: "narration-standard-en",
        revision: "audio-r1",
      },
    });
    expect(material["math.math-verification"]).toMatchObject({
      curriculumRevision: "curriculum-r1",
      tools: { verifierVersion: "math-verifier.v3" },
    });
    expect(material["math.render"]).toMatchObject({
      profile: {
        profileRevision: "lesson-profile-r1",
        lessonVariant: "standard",
      },
      configuration: {
        grade: 5,
        locale: "en",
      },
      visualStyleRevision: "visual-r1",
      renderer: {
        manifestVersions: { svg: "renderer-r1", formula: "katex-r1" },
        runtimeVersions: { svg: "renderer-r1", formula: "katex-r1" },
      },
    });
    expect(material["math.tts"]).toMatchObject({
      profile: { contentVariant: "full" },
      provider: {
        presetId: "narration-standard-en",
        revision: "audio-r1",
      },
    });
    const registry = createTaskRegistry(
      createMathTaskRegistrations(
        {},
        {
          profileReady: true,
          profileReasons: [],
          curriculumReady: true,
          curriculumReasons: [],
          visualStyleReady: false,
          visualStyleReasons: ["Style approval missing."],
          deterministicVerificationSupported: true,
          verificationReasons: [],
          providerTasksAuthorized: false,
          providerReasons: ["Provider authorization missing."],
        }
      )
    );
    const readiness = registry.readiness("math.visual-assets", {
      profileId: "mathematics-education",
      completedTaskIds: new Set(MATH_TASK_IDS),
      availableArtifacts: registry.get("math.visual-assets").definition.inputs,
      approvedTaskIds: new Set(),
    });
    expect(readiness.status).toBe("blocked");
    expect(readiness.reasons).toContain("Style approval missing.");
  });

  it("emits every non-overridable math failure and keeps production gates separate", () => {
    const failures = mathHardFailures({
      ...passingEvidence(),
      statementCorrect: false,
      symbolicResultsVerified: false,
      essentialInformationAccessible: false,
    });
    expect(failures.map((failure) => failure.code)).toEqual([
      "MATH_STATEMENT_INCORRECT",
      "MATH_SYMBOLIC_RESULT_UNVERIFIED",
      "MATH_ESSENTIAL_INFORMATION_INACCESSIBLE",
    ]);
    expect(failures.every((failure) => !failure.overridable)).toBe(true);

    const scores = Object.fromEntries(
      MATH_PROFILE_QUALITY_DIMENSIONS.map(([name]) => [name, 100])
    ) as Record<(typeof MATH_PROFILE_QUALITY_DIMENSIONS)[number][0], number>;
    const assessment = buildMathProfileQualityAssessment({
      artifact: {
        schemaVersion: ARTIFACT_SCHEMA_VERSION,
        unitId: "m5-zo-001-standard" as never,
        profileId: "mathematics-education",
        locale: "en",
        variant: "full",
        kind: "lesson-specification",
        artifactRevision: "r1",
        workflowRevision: "r1",
        policyRevision: "r1",
      },
      scores,
      evidence: passingEvidence(),
      assessedAt: NOW,
    });
    expect(assessment).toMatchObject({ status: "READY", weightedScore: 100 });
    const gates = evaluateMathProductionGates({
      mathematicalVerificationPassed: true,
      pedagogyPassed: true,
      visualSemanticsPassed: true,
      accessibilityPassed: true,
      narrationTimingPassed: true,
      captionsPassed: true,
      audiovisualPassed: true,
      metadataPassed: true,
      publishDryRunPassed: true,
      publishApprovalCurrent: false,
    });
    expect(gates).toMatchObject({
      renderReady: true,
      publishDryRunReady: true,
      publishReady: false,
    });
  });

  it("imports legacy v2 only as reconciliation evidence and persists actionable profile status", async () => {
    const migration = adaptLegacyMathWorkflowManifest(legacyManifest());
    expect(migration.status).toBe("reconciliation-required");
    expect(
      migration.taskEvidence.every((item) => item.status !== "candidate")
    ).toBe(true);
    expect(() =>
      adaptLegacyMathWorkflowManifest({
        ...legacyManifest(),
        unsupportedLineage: "math-verifier.v2",
      })
    ).toThrow(/unsupported/u);

    const root = await fs.mkdtemp(path.join(os.tmpdir(), "math-profile-"));
    const before = await inspectMathMigrationStatus(root, () => new Date(NOW));
    expect(before.blockers).toEqual([
      "MATH_LESSON_PROFILE_MISSING",
      "MATH_VISUAL_STYLE_MISSING",
    ]);
    const store = new MathProfileStore(root);
    expect(
      (await store.writeLessonProfile(lessonProfile())).invalidatedTaskIds
    ).toContain("math.publish");
    expect(
      (await store.writeVisualStyle(visualStyle())).invalidatedTaskIds
    ).toContain("math.render");
    const after = await inspectMathMigrationStatus(root, () => new Date(NOW));
    expect(after.status).toBe("ready");
  });

  it("passes full and Short shared-engine traversals for all locales and lesson variants", async () => {
    const result = runMathProfileDeterministicFixture();
    expect(result).toMatchObject({
      status: "passed",
      providerCalls: 0,
      stateSource: "shared-engine",
    });
    expect(result.traversals).toHaveLength(30);
    expect(
      result.traversals.every(
        (item) => item.taskIds.length === MATH_TASK_IDS.length
      )
    ).toBe(true);
    const expected = { complete: false, nextTaskId: "math.curriculum-import" };
    await expect(
      deriveMathWorkflowState({ status: async () => expected } as never)
    ).resolves.toBe(expected);
  });

  it("exercises offline v3 verification for every approved curriculum domain", async () => {
    const workspaceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-profile-verification-")
    );
    const curriculumRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-profile-curriculum-")
    );
    await createReviewedCurriculumFixture(curriculumRoot, undefined, {
      preserveSkillIdentity: true,
    });
    const pythonExecutable =
      process.env["MATH_VERIFIER_PYTHON"] ??
      path.resolve("python/math-verifier/.venv/bin/python");
    for (const [index, skillId] of [
      "M5-ZO-001",
      "M5-GM-002",
      "M5-DZ-001",
    ].entries()) {
      const result = await runPilotSimulation({
        repositoryRoot: process.cwd(),
        workspaceDir,
        curriculumRoot,
        skillId,
        variant: "standard",
        languages: index === 0 ? ["de", "en", "es", "fr", "pt"] : ["de"],
        pythonExecutable,
      });
      const verification = JSON.parse(
        await fs.readFile(
          path.join(
            workspaceDir,
            result.lessonId,
            "canonical",
            "verification.json"
          ),
          "utf8"
        )
      ) as { status: string; protocolVersion: string };
      expect(verification.status).toBe("passed");
      expect(verification.protocolVersion).toBe("math-verifier.v3");
      expect(result.paidProviderCalled).toBe(false);
    }
  }, 30_000);
});
