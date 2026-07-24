import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { registerMathCommands } from "./math-commands.js";
import {
  MATH_QUALITY_GATES,
  MATH_STAGES,
  canonicalHash,
  createMathMetadataEvidence,
  createMetadataTimingEvidence,
  createMetadataWorkflowEvidence,
  createReviewedMetadataContext,
  createPublishDryRunManifest,
  createArtifactLineage,
  createVerifierRequest,
  deriveMathQuality,
  generateMathMetadata,
  localizeNarration,
  localizedDisplayChecks,
  mathPlaylistCatalog,
  buildLessonVariant,
  createTimingManifest,
  qualityCheck,
  saveWorkflowManifest,
  SYMPY_VERSION,
  VERIFIER_PROTOCOL_VERSION,
  VERIFIER_VERSION,
  type MathArtifactLineage,
  type MathLanguage,
  type MathQualityCheckId,
  type WorkflowManifest,
} from "@mediaforge/math-education";
import { hashFile, hashText, writeJsonAtomic } from "@mediaforge/shared";
import { createReviewedCurriculumFixture } from "../../../packages/math-education/dist/testing/reviewed-curriculum-fixture.js";

vi.mock("@mediaforge/math-education", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...(await import("../../../packages/math-education/src/curriculum/release.js")),
  ...(await import("../../../packages/math-education/src/orchestration/canonical-task-adapters.js")),
  ...(await import("../../../packages/math-education/src/orchestration/batch-planner.js")),
  ...(await import("../../../packages/math-education/src/orchestration/math-workspace-paths.js")),
  ...(await import("../../../packages/math-education/src/review/private-owner-attestation.js")),
}));

describe("math commands", () => {
  it("registers an additive top-level command and approved subcommands", () => {
    const program = new Command();
    registerMathCommands(program);
    const math = program.commands.find((command) => command.name() === "math");
    expect(math).toBeDefined();
    expect(math?.commands.map((command) => command.name())).toEqual(
      expect.arrayContaining([
        "curriculum",
        "lesson",
        "production",
        "batch",
        "verify",
        "quality",
        "metadata",
        "status",
        "publish",
      ])
    );
  });

  it("keeps curriculum import dry-run read-only", async () => {
    const skillsPath = "packages/math-education/data/curriculum/v1/skills.json";
    const before = await fs.readFile(skillsPath, "utf8");
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      const program = new Command();
      registerMathCommands(program);
      await program.parseAsync([
        "node",
        "test",
        "math",
        "curriculum",
        "import",
        "--dry-run",
      ]);
      expect(stdout).toHaveBeenCalledWith(
        expect.stringContaining('"matchesNormalizedRelease": true')
      );
      expect(await fs.readFile(skillsPath, "utf8")).toBe(before);
    } finally {
      stdout.mockRestore();
    }
  });

  it("projects the executable private plan and identifies unavailable live tasks without side effects", async () => {
    const workspace = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-cli-canonical-plan-")
    );
    const before = await fs.readdir(workspace);
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      await parseMath([
        "production",
        "plan",
        "--skill",
        "M5-ZO-001",
        "--variant",
        "standard",
        "--language",
        "de",
      ]);
      const result = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
        taskIds: string[];
        unavailableLiveTasks: string[];
        stages: Array<{ taskId: string }>;
        writes: number;
        subprocesses: number;
        providers: number;
      };
      expect(result.taskIds).toHaveLength(16);
      expect(result.stages.map((stage) => stage.taskId)).toEqual(
        result.taskIds
      );
      expect(result.unavailableLiveTasks).toEqual([
        "math.publish-approval",
        "math.publish",
      ]);
      expect(result).toMatchObject({
        writes: 0,
        subprocesses: 0,
        providers: 0,
      });
      expect(await fs.readdir(workspace)).toEqual(before);
    } finally {
      stdout.mockRestore();
    }
  });

  it("plans registered owner-attested private production without side effects", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      await parseMath([
        "production",
        "plan",
        "--skill",
        "M5-GM-002",
        "--variant",
        "standard",
        "--language",
        "de",
        "--private",
      ]);
      expect(
        JSON.parse(String(stdout.mock.calls.at(-1)?.[0]))
      ).toMatchObject({
        dryRun: true,
        writes: 0,
        providers: 0,
        visibility: "private",
        paidProviderAuthorized: false,
        curriculumApprovalHash:
          "5abffd11c1de3eb9307702a89c2746c7ed907b8810a42e12b7ca9d6de55c8519",
      });
    } finally {
      stdout.mockRestore();
    }
  });

  it("runs and resumes explicit simulation through WorkflowOperator instead of the legacy pilot state machine", async () => {
    const workspace = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-cli-canonical-run-")
    );
    const python = path.resolve("python/math-verifier/.venv/bin/python");
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      const common = [
        "--skill",
        "M5-ZO-001",
        "--variant",
        "standard",
        "--language",
        "de",
        "--simulate",
        "--workspace",
        workspace,
        "--python",
        python,
      ] as const;
      await parseMath(["production", "run", ...common]);
      const first = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
        stateSource: string;
        status: string;
        paidProviderCalled: boolean;
        results: Array<{ taskId: string }>;
      };
      expect(first).toMatchObject({
        stateSource: "workflow-operator",
        status: "succeeded",
        paidProviderCalled: false,
      });
      expect(first.results).toHaveLength(16);

      await parseMath(["production", "resume", ...common]);
      const resumed = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
        stateSource: string;
        status: string;
        results: unknown[];
      };
      expect(resumed).toMatchObject({
        stateSource: "workflow-operator",
        status: "succeeded",
        results: [],
      });
      const lessonRoot = path.join(workspace, "m5-zo-001-standard");
      expect(
        await fs.stat(
          path.join(
            lessonRoot,
            "state",
            "workflow",
            "math.production",
            "state.json"
          )
        )
      ).toBeDefined();
      await expect(
        fs.stat(path.join(lessonRoot, "manifest.json"))
      ).rejects.toMatchObject({
        code: "ENOENT",
      });
      const source = await fs.readFile("apps/cli/src/math-commands.ts", "utf8");
      const productionSource = source.slice(
        source.indexOf("const production = math"),
        source.indexOf("const batch = math")
      );
      expect(productionSource).not.toContain("runPilotSimulation");
    } finally {
      stdout.mockRestore();
    }
  }, 30_000);

  it("excludes unsupported lesson capabilities when creating a batch", async () => {
    const workspace = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-cli-batch-")
    );
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      const program = new Command();
      registerMathCommands(program);
      await program.parseAsync([
        "node",
        "test",
        "math",
        "batch",
        "create",
        "--grade",
        "5",
        "--variant",
        "standard",
        "--language",
        "de",
        "--workspace",
        workspace,
      ]);
      expect(stdout).toHaveBeenCalledWith(
        expect.stringContaining('"itemCount": 3')
      );
      expect(stdout).toHaveBeenCalledWith(
        expect.stringContaining('"excludedCount": 34')
      );
      const files = await fs.readdir(path.join(workspace, "state", "batches"));
      expect(files).toHaveLength(1);
    } finally {
      stdout.mockRestore();
    }
  });

  it("plans all 37 canonical private lessons while reusing compatible unit state without writes or provider calls", async () => {
    const workspace = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-cli-private-batch-plan-")
    );
    await writeJsonAtomic(
      path.join(
        workspace,
        "m5-zo-001-standard",
        "state",
        "workflow",
        "math.production",
        "state.json"
      ),
      {
        schemaVersion: "mediaforge.workflow.v1",
        id: "workflow-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        workflowId: "math.production",
        workflowRevision: "math.task-registry.v3",
        unitId: "m5-zo-001-standard",
        profileId: "mathematics-education",
        locale: "de",
        variant: "full",
        tasks: [],
        createdAt: "2026-07-24T00:00:00.000Z",
        updatedAt: "2026-07-24T00:00:00.000Z",
      }
    );
    const before = await fs.readdir(workspace);
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      await parseMath([
        "batch",
        "plan",
        "--grade",
        "5",
        "--variant",
        "standard",
        "--language",
        "de",
        "--private",
        "--paid-speech",
        "--workspace",
        workspace,
      ]);
      const result = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
        batchId: string;
        itemCount: number;
        excludedCount: number;
        orderedSkillIds: string[];
        totals: {
          workflowTaskCount: number;
          plannedProviderCalls: number;
        };
        privacy: {
          outputVisibility: string;
          livePublishingAvailable: boolean;
          plannedRemoteMutations: number;
        };
        requiredApproval: {
          paidProviderAuthorized: boolean;
          exactInstruction: string;
        };
        workspaceEvidence: {
          collisionFree: boolean;
          existingUnitCount: number;
          reusableUnitCount: number;
          batchStateExists: boolean;
        };
        writes: number;
        providerCallsSubmitted: number;
      };
      expect(result).toMatchObject({
        itemCount: 37,
        excludedCount: 0,
        writes: 0,
        providerCallsSubmitted: 0,
        privacy: {
          outputVisibility: "private",
          livePublishingAvailable: false,
          plannedRemoteMutations: 0,
        },
        requiredApproval: {
          paidProviderAuthorized: false,
        },
        workspaceEvidence: {
          collisionFree: true,
          existingUnitCount: 1,
          reusableUnitCount: 1,
          batchStateExists: false,
        },
      });
      expect(result.batchId).toMatch(/^batch-[a-f0-9]{40}$/u);
      expect(result.orderedSkillIds).toHaveLength(37);
      expect(new Set(result.orderedSkillIds).size).toBe(37);
      expect(result.totals.workflowTaskCount).toBe(592);
      expect(result.totals.plannedProviderCalls).toBeGreaterThan(0);
      expect(result.requiredApproval.exactInstruction).toContain(
        "canonical 37-lesson Class 5"
      );
      expect(await fs.readdir(workspace)).toEqual(before);
    } finally {
      stdout.mockRestore();
    }
  }, 30_000);

  it("rejects an existing private unit with mismatched workflow identity", async () => {
    const workspace = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-cli-private-batch-identity-")
    );
    await writeJsonAtomic(
      path.join(
        workspace,
        "m5-zo-001-standard",
        "state",
        "workflow",
        "math.production",
        "state.json"
      ),
      {
        schemaVersion: "mediaforge.workflow.v1",
        id: "workflow-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        workflowId: "math.production",
        workflowRevision: "math.task-registry.v3",
        unitId: "m5-zo-999-standard",
        profileId: "mathematics-education",
        locale: "de",
        variant: "full",
        tasks: [],
        createdAt: "2026-07-24T00:00:00.000Z",
        updatedAt: "2026-07-24T00:00:00.000Z",
      }
    );

    await expect(
      parseMath([
        "batch",
        "plan",
        "--grade",
        "5",
        "--variant",
        "standard",
        "--language",
        "de",
        "--private",
        "--paid-speech",
        "--workspace",
        workspace,
      ])
    ).rejects.toThrow(/incompatible workflow identity/u);
  });

  async function qualityLesson(
    workspace: string,
    lessonId: string,
    failed?: MathQualityCheckId,
    options: {
      reportLessonId?: string;
      selectedLocales?: MathLanguage[];
      packet?: {
        pathLanguage?: MathLanguage;
        lessonId?: string;
        language?: MathLanguage;
      };
      approval?: unknown;
    } = {}
  ) {
    const lessonRoot = path.join(workspace, lessonId);
    const qualityPath = path.join(lessonRoot, "canonical", "quality.json");
    const reportLessonId = options.reportLessonId ?? lessonId;
    const selectedLocales = options.selectedLocales ?? ["de"];
    const evidenceHash = (label: string) =>
      canonicalHash({ lessonId: reportLessonId, label });
    const quality = deriveMathQuality({
      contractVersion: "math-quality-contract.v2",
      lessonId: reportLessonId,
      selectedLocales,
      checks: MATH_QUALITY_GATES.map((gate) => qualityCheck({
        checkId: gate.checkId,
        ready: gate.checkId !== failed,
        ...(gate.checkId !== failed ? { evidenceHash: evidenceHash(gate.checkId) } : {}),
        message: `${gate.checkId} evidence`,
        ...(gate.checkId === "localization"
          ? { assessedLocales: selectedLocales }
          : {}),
      })),
    });
    await writeJsonAtomic(qualityPath, quality);
    const now = "2026-07-13T12:00:00.000Z";
    let parentFingerprints = [canonicalHash({ lessonId, root: true })];
    const stages = MATH_STAGES.map((stage) => {
      const fingerprint = canonicalHash({ lessonId, stage, parentFingerprints });
      const record = {
        stage,
        status: stage === "quality-gate" ? ("succeeded" as const) : ("planned" as const),
        fingerprint,
        parentFingerprints,
        outputArtifacts: [] as MathArtifactLineage[],
        updatedAt: now,
      };
      parentFingerprints = [fingerprint];
      return record;
    });
    const outputs: MathArtifactLineage[] = [];
    const qualityParents = stages.find(
      (stage) => stage.stage === "quality-gate"
    )!.parentFingerprints;
    outputs.push(
      await createArtifactLineage({
        root: lessonRoot,
        relativePath: "canonical/quality.json",
        schemaVersion: "math-quality.v2",
        parentHashes: qualityParents,
        producedBy: "quality-gate",
      })
    );
    if (options.approval) {
      await writeJsonAtomic(
        path.join(lessonRoot, "canonical", "minor-edit-approval.json"),
        options.approval
      );
      outputs.push(
        await createArtifactLineage({
          root: lessonRoot,
          relativePath: "canonical/minor-edit-approval.json",
          schemaVersion: "math-minor-approval.v1",
          parentHashes: qualityParents,
          producedBy: "quality-gate",
        })
      );
    }
    if (options.packet) {
      const pathLanguage = options.packet.pathLanguage ?? "de";
      const release = await createReviewedCurriculumFixture(
        await fs.mkdtemp(path.join(os.tmpdir(), "math-cli-release-"))
      );
      const skill = release.skills.find((item) => item.skillId === "M5-ZO-001")!;
      const lesson = buildLessonVariant(skill, "standard");
      const localization = localizeNarration(lesson, pathLanguage);
      const timing = createTimingManifest(lesson, localization);
      const timingEvidence = createMetadataTimingEvidence(lesson, localization, timing);
      const metadataParents = stages.find(
        (stage) => stage.stage === "metadata-playlists"
      )!.parentFingerprints;
      const metadata = generateMathMetadata({
        reviewedContext: createReviewedMetadataContext(release, skill.skillId),
        skill,
        lesson,
        localization,
        timingEvidence,
        workflowEvidence: createMetadataWorkflowEvidence({
          lesson,
          localization,
          timingEvidence,
          parentFingerprints: {
            lesson: [stages.find((stage) => stage.stage === "lesson-spec")!.parentFingerprints[0]!],
            localization: [stages.find((stage) => stage.stage === "localization")!.parentFingerprints[0]!],
            timing: [stages.find((stage) => stage.stage === "scene-timing")!.parentFingerprints[0]!],
            output: [metadataParents[0]!],
          },
        }),
        evidence: createMathMetadataEvidence(skill, lesson, localization),
      });
      const localeRoot = `locales/${pathLanguage}`;
      const metadataRelativePath = `${localeRoot}/metadata.json`;
      const catalogRelativePath = `${localeRoot}/playlist-catalog.json`;
      const thumbnailAssetRelativePath = `${localeRoot}/thumbnail.svg`;
      const thumbnailRelativePath = `${localeRoot}/thumbnail.svg.manifest.json`;
      const policyRelativePath = `${localeRoot}/brand-policy.json`;
      const finalMediaRelativePath = `${localeRoot}/render/final.mp4`;
      const finalEvidenceRelativePath = `${localeRoot}/final-media.json`;
      const packetRelativePath = `locales/${pathLanguage}/publish-dry-run.json`;
      const verificationRequest = createVerifierRequest(`${lesson.lessonId}-canonical`, lesson.checks);
      const displayRequest = createVerifierRequest(`${lesson.lessonId}-${pathLanguage}-display`, localizedDisplayChecks(lesson, localization));
      const passed = (request: ReturnType<typeof createVerifierRequest>) => ({
        protocolVersion: VERIFIER_PROTOCOL_VERSION,
        requestId: request.requestId,
        inputHash: request.inputHash,
        verifierVersion: VERIFIER_VERSION,
        sympyVersion: SYMPY_VERSION,
        status: "passed" as const,
        checks: request.checks.map((check) => ({ checkId: check.checkId, status: "passed" as const })),
      });
      await writeJsonAtomic(path.join(lessonRoot, "canonical/lesson-spec.json"), lesson);
      await writeJsonAtomic(path.join(lessonRoot, "canonical/verification.json"), passed(verificationRequest));
      await writeJsonAtomic(path.join(lessonRoot, `${localeRoot}/narration.json`), localization);
      await writeJsonAtomic(path.join(lessonRoot, `${localeRoot}/display-verification.json`), passed(displayRequest));
      await writeJsonAtomic(path.join(lessonRoot, metadataRelativePath), metadata);
      await writeJsonAtomic(path.join(lessonRoot, catalogRelativePath), mathPlaylistCatalog);
      await fs.mkdir(path.join(lessonRoot, localeRoot), { recursive: true });
      await fs.mkdir(path.dirname(path.join(lessonRoot, finalMediaRelativePath)), { recursive: true });
      await fs.writeFile(path.join(lessonRoot, thumbnailAssetRelativePath), "<svg width=\"1920\" height=\"1080\"/>");
      await fs.writeFile(path.join(lessonRoot, finalMediaRelativePath), "video");
      const thumbnailHash = await hashFile(path.join(lessonRoot, thumbnailAssetRelativePath));
      const thumbnailByteLength = (await fs.stat(path.join(lessonRoot, thumbnailAssetRelativePath))).size;
      const sourceOutputs = [
        await createArtifactLineage({ root: lessonRoot, relativePath: "canonical/lesson-spec.json", schemaVersion: "lesson-spec.v1", parentHashes: stages.find((stage) => stage.stage === "lesson-spec")!.parentFingerprints, producedBy: "lesson-spec", producer: "lesson-specification-builder", producerVersion: "reviewed-fixtures.v1" }),
        await createArtifactLineage({ root: lessonRoot, relativePath: "canonical/verification.json", schemaVersion: VERIFIER_PROTOCOL_VERSION, parentHashes: stages.find((stage) => stage.stage === "math-verification")!.parentFingerprints, producedBy: "math-verification", producer: "sympy-verifier-adapter", producerVersion: VERIFIER_VERSION }),
        await createArtifactLineage({ root: lessonRoot, relativePath: `${localeRoot}/narration.json`, schemaVersion: "math-narration.v2", parentHashes: stages.find((stage) => stage.stage === "localization")!.parentFingerprints, producedBy: "localization", producer: "locked-fact-localizer", producerVersion: "locked-facts.v2" }),
        await createArtifactLineage({ root: lessonRoot, relativePath: `${localeRoot}/display-verification.json`, schemaVersion: VERIFIER_PROTOCOL_VERSION, parentHashes: stages.find((stage) => stage.stage === "localization")!.parentFingerprints, producedBy: "localization", producer: "sympy-verifier-adapter", producerVersion: VERIFIER_VERSION }),
      ];
      for (const source of sourceOutputs) {
        const stage = stages.find((candidate) => candidate.stage === source.producedBy)!;
        stage.outputArtifacts.push(source);
        stage.status = "succeeded";
      }
      const sourceByPath = (relativePath: string) => sourceOutputs.find((source) => source.relativePath === relativePath)!;
      const thumbnailManifest = {
        artifactVersion: "math-thumbnail.v1", identity: {
          lessonId,
          skillId: skill.skillId,
          language: pathLanguage,
          variant: "standard",
          grade: 5,
          curriculumReleaseId: metadata.identity.curriculumReleaseId,
          curriculumReleaseHash: metadata.identity.curriculumReleaseHash,
          localizationHash: metadata.identity.localizationHash,
        },
        specVersion: "math-thumbnail-spec.v2", rendererVersion: "math-thumbnail-renderer.v3",
        fontProfile: { id: "math-thumbnail-fonts.v1", textFamily: "MathThumbnailText", formulaFamily: "MathThumbnailFormula", textFontFile: "KaTeX_SansSerif-Bold.woff2", formulaFontFile: "KaTeX_Main-Regular.woff2", textFontHash: "6".repeat(64), formulaFontHash: "7".repeat(64), measurementModel: "unicode-conservative.v1" },
        profile: "grades-5-7-v1",
        teacherVersion: "alex.v1-approved", teacherManifestHash: "5".repeat(64), teacherPoseId: "neutral", teacherPoseHash: "1".repeat(64),
        artwork: {
          status: "approved-publish-artwork",
          publishReady: true,
          blockers: [],
          license: "Unit-test approved artwork license.",
          provenance: "Unit-test approved artwork provenance.",
        },
        inputHashes: { lessonContent: lesson.contentHash, metadata: canonicalHash(metadata), fact: "2".repeat(64), verification: "4".repeat(64), spec: "3".repeat(64) },
        dimensions: { width: 1920, height: 1080, aspectRatio: "16:9" }, safeArea: { x: 96, y: 54, width: 1728, height: 972 },
        readability: { wordCount: 3, textFontPx: 96, formulaFontPx: 92, measuredTextWidth: 500, measuredFormulaWidth: 500, measuredFormulaHeight: 120, mobileReadable: true },
        teacherAreaRatio: 0.2,
        formulaPriority: true,
        factId: metadata.thumbnail.formulaFactId,
        factSemanticHash: "2".repeat(64),
        verification: {
          requestId: "thumbnail-test",
          requestContentHash: "4".repeat(64),
          responseContentHash: "4".repeat(64),
          referencedFactIds: [metadata.thumbnail.formulaFactId],
          referencedCheckIds: [lesson.facts.find((fact) => fact.factId === metadata.thumbnail.formulaFactId)!.checkIds[0]!],
        },
        sourceLineage: {
          lesson: { stage: "lesson-spec", relativePath: "canonical/lesson-spec.json", schemaVersion: "lesson-spec.v1", contentHash: sourceByPath("canonical/lesson-spec.json").contentHash, producer: "lesson-specification-builder", producerVersion: "reviewed-fixtures.v1", parentFingerprints: stages.find((stage) => stage.stage === "lesson-spec")!.parentFingerprints },
          verification: { stage: "math-verification", relativePath: "canonical/verification.json", schemaVersion: VERIFIER_PROTOCOL_VERSION, contentHash: sourceByPath("canonical/verification.json").contentHash, producer: "sympy-verifier-adapter", producerVersion: VERIFIER_VERSION, parentFingerprints: stages.find((stage) => stage.stage === "math-verification")!.parentFingerprints },
          localization: { stage: "localization", relativePath: `${localeRoot}/narration.json`, schemaVersion: "math-narration.v2", contentHash: sourceByPath(`${localeRoot}/narration.json`).contentHash, producer: "locked-fact-localizer", producerVersion: "locked-facts.v2", parentFingerprints: stages.find((stage) => stage.stage === "localization")!.parentFingerprints },
          localizedVerification: { stage: "localization", relativePath: `${localeRoot}/display-verification.json`, schemaVersion: VERIFIER_PROTOCOL_VERSION, contentHash: sourceByPath(`${localeRoot}/display-verification.json`).contentHash, producer: "sympy-verifier-adapter", producerVersion: VERIFIER_VERSION, parentFingerprints: stages.find((stage) => stage.stage === "localization")!.parentFingerprints },
          metadata: { stage: "metadata-playlists", relativePath: metadataRelativePath, schemaVersion: "math-metadata.v2", contentHash: await hashFile(path.join(lessonRoot, metadataRelativePath)), producer: "math-metadata-generator", producerVersion: "math-metadata-generator.v3", parentFingerprints: metadataParents },
        },
        workflow: {
          owningStage: "metadata-playlists",
          producer: "math-thumbnail-renderer",
          producerVersion: "math-thumbnail-renderer.v3",
          parentFingerprints: metadataParents,
        },
        outputPath: "thumbnail.svg",
        contentHash: thumbnailHash,
        byteLength: thumbnailByteLength,
      };
      await writeJsonAtomic(path.join(lessonRoot, thumbnailRelativePath), thumbnailManifest);
      const policy = {
        artifactVersion: "math-brand-policy.v1", privacyStatus: "private", madeForKids: false, containsSyntheticMedia: true,
        channels: (["de", "en", "es", "fr", "pt"] as const).map((language) => ({ language, channelId: `math-${language}`, playlists: Object.fromEntries(metadata.playlists.map((playlist) => [playlist.key, `${language}-${playlist.kind}`])) })),
      };
      await writeJsonAtomic(path.join(lessonRoot, policyRelativePath), policy);
      const qualityHash = await hashFile(qualityPath);
      const finalMediaHash = await hashFile(path.join(lessonRoot, finalMediaRelativePath));
      const finalMediaByteLength = (await fs.stat(path.join(lessonRoot, finalMediaRelativePath))).size;
      const renderStage = stages.find((stage) => stage.stage === "render")!;
      const finalMedia = {
        artifactVersion: "math-final-media.v1",
        owningStage: "render",
        producer: "provider-free-media",
        producerVersion: "provider-free-media.v1",
        parentFingerprints: renderStage.parentFingerprints,
        identity: { lessonId, skillId: skill.skillId, language: pathLanguage, variant: "standard" },
        mediaPath: finalMediaRelativePath,
        mediaHash: finalMediaHash,
        mediaByteLength: finalMediaByteLength,
        qualityEvidenceHash: qualityHash,
        width: 1920, height: 1080, durationSeconds: 240, mediaQaPassed: true,
      };
      await writeJsonAtomic(path.join(lessonRoot, finalEvidenceRelativePath), finalMedia);
      const channel = policy.channels.find((item) => item.language === pathLanguage)!;
      const packet = createPublishDryRunManifest({
        metadata, metadataPath: metadataRelativePath,
        thumbnailManifestPath: thumbnailRelativePath, thumbnailManifestHash: hashText(JSON.stringify(thumbnailManifest, null, 2) + "\n"),
        thumbnailAssetPath: thumbnailAssetRelativePath, thumbnailAssetHash: thumbnailHash,
        finalMediaPath: finalMediaRelativePath, finalMediaHash,
        finalMediaEvidencePath: finalEvidenceRelativePath, finalMediaEvidenceHash: canonicalHash(finalMedia),
        qualityPath: "canonical/quality.json", qualityHash,
        brandPolicyPath: policyRelativePath, brandPolicyHash: hashText(JSON.stringify(policy, null, 2) + "\n"),
        channelId: channel.channelId, privacyStatus: "private", madeForKids: false, containsSyntheticMedia: true,
        playlistIdsByKey: channel.playlists,
      });
      await writeJsonAtomic(path.join(lessonRoot, packetRelativePath), {
        ...packet,
        identity: { ...packet.identity, lessonId: options.packet.lessonId ?? lessonId, language: options.packet.language ?? pathLanguage },
      });
      const metadataOutputs = await Promise.all([
        [metadataRelativePath, "math-metadata.v2"], [catalogRelativePath, "math-playlist-catalog.v1"],
        [thumbnailRelativePath, "math-thumbnail.v1"], [policyRelativePath, "math-brand-policy.v1"],
        [packetRelativePath, "math-publish-dry-run.v2"],
      ].map(([relativePath, schemaVersion]) => createArtifactLineage({
        root: lessonRoot,
        relativePath: relativePath!,
        schemaVersion: schemaVersion as any,
        parentHashes: metadataParents,
        producedBy: "metadata-playlists",
        ...(schemaVersion === "math-metadata.v2"
          ? { producer: "math-metadata-generator", producerVersion: "math-metadata-generator.v3" }
          : {}),
      })));
      metadataOutputs.push(await createArtifactLineage({
        root: lessonRoot,
        relativePath: thumbnailAssetRelativePath,
        schemaVersion: "math-thumbnail-binary.v1",
        payloadKind: "binary",
        parentHashes: metadataParents,
        producedBy: "metadata-playlists",
        producer: "math-thumbnail-renderer",
        producerVersion: "math-thumbnail-renderer.v3",
        identity: { lessonId, skillId: skill.skillId, language: pathLanguage, variant: "standard" },
      }));
      stages.find(
        (stage) => stage.stage === "metadata-playlists"
      )!.outputArtifacts.push(...metadataOutputs);
      stages.find(
        (stage) => stage.stage === "metadata-playlists"
      )!.status = "succeeded";
      renderStage.outputArtifacts.push(await createArtifactLineage({ root: lessonRoot, relativePath: finalEvidenceRelativePath, schemaVersion: "math-final-media.v1", parentHashes: renderStage.parentFingerprints, producedBy: "render" }));
      renderStage.outputArtifacts.push(await createArtifactLineage({
        root: lessonRoot,
        relativePath: finalMediaRelativePath,
        schemaVersion: "math-final-media-binary.v1",
        payloadKind: "binary",
        parentHashes: renderStage.parentFingerprints,
        producedBy: "render",
        producer: "provider-free-media",
        producerVersion: "provider-free-media.v1",
        identity: { lessonId, skillId: skill.skillId, language: pathLanguage, variant: "standard" },
      }));
      renderStage.status = "succeeded";
    }
    stages.find(
      (stage) => stage.stage === "quality-gate"
    )!.outputArtifacts.push(...outputs);
    const manifest: WorkflowManifest = {
      artifactVersion: "math-workflow.v2",
      lessonId,
      curriculumReleaseId: "de-gems-5-10-v1",
      simulated: true,
      paidProviderCalled: false,
      stages,
      failures: [],
    };
    const manifestPath = path.join(lessonRoot, "manifest.json");
    await saveWorkflowManifest(manifestPath, manifest);
    return { quality, qualityPath, manifest, manifestPath, lessonRoot };
  }

  async function parseMath(args: readonly string[]) {
    const program = new Command();
    registerMathCommands(program);
    return program.parseAsync(["node", "test", "math", ...args]);
  }

  it("loads only workflow-owned quality and emits derived status, scope, blockers, approval, and permissions", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "math-cli-quality-"));
    const lessonId = "m5-zo-001-standard";
    await qualityLesson(workspace, lessonId, "render");
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    process.exitCode = undefined;
    try {
      const program = new Command();
      registerMathCommands(program);
      await program.parseAsync(["node", "test", "math", "quality", "check", "--lesson", lessonId, "--workspace", workspace]);
      expect(process.exitCode).toBe(3);
      const output = String(stdout.mock.calls.at(-1)?.[0]);
      expect(output).toContain('"derivedStatus": "RENDER_BLOCKED"');
      expect(output).toContain('"selectedScope"');
      expect(output).toContain('"approval"');
      expect(output).toContain('"publishAllowed": false');
    } finally {
      process.exitCode = undefined;
      stdout.mockRestore();
    }
  });

  it("maps CLI quality selections to exit 0, 2, and 3", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "math-cli-exits-"));
    await qualityLesson(workspace, "m5-zo-001-standard");
    await qualityLesson(workspace, "m5-zo-002-standard", "audio");
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      for (const { lessons, expected } of [
        { lessons: ["m5-zo-001-standard"], expected: 0 },
        { lessons: ["m5-zo-001-standard", "m5-zo-002-standard"], expected: 2 },
        { lessons: ["m5-zo-002-standard"], expected: 3 },
      ] as const) {
        process.exitCode = undefined;
        const program = new Command();
        registerMathCommands(program);
        await program.parseAsync(["node", "test", "math", "status", "--lesson", ...lessons, "--workspace", workspace]);
        expect(process.exitCode).toBe(expected);
      }
    } finally {
      process.exitCode = undefined;
      stdout.mockRestore();
    }
  });

  it("returns exit 1 for arbitrary, injected, or hash-invalid quality JSON", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "math-cli-invalid-"));
    const lessonId = "m5-zo-001-standard";
    const { qualityPath } = await qualityLesson(workspace, lessonId);
    await writeJsonAtomic(qualityPath, { status: "READY", publishableWithoutApproval: true, approvedMinorEdits: true, inlineEvidence: {} });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    process.exitCode = undefined;
    try {
      const program = new Command();
      registerMathCommands(program);
      await expect(program.parseAsync(["node", "test", "math", "quality", "check", "--lesson", lessonId, "--workspace", workspace])).rejects.toThrow(/not reusable/u);
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = undefined;
      stdout.mockRestore();
    }
  });

  it("rejects report identity mismatches and transplanted authoritative suffixes", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "math-cli-identity-"));
    const requested = "m5-zo-001-standard";
    await qualityLesson(workspace, requested, undefined, {
      reportLessonId: "m5-zo-999-standard",
    });
    process.exitCode = undefined;
    await expect(
      parseMath(["quality", "check", "--lesson", requested, "--workspace", workspace])
    ).rejects.toThrow(/identity/u);
    expect(process.exitCode).toBe(1);

    const transplantWorkspace = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-cli-transplant-")
    );
    const target = await qualityLesson(
      transplantWorkspace,
      requested,
      "render"
    );
    const donor = await qualityLesson(
      transplantWorkspace,
      "m5-zo-002-standard"
    );
    await fs.copyFile(donor.qualityPath, target.qualityPath);
    const suffixStart = MATH_STAGES.indexOf("metadata-playlists");
    target.manifest.stages.splice(
      suffixStart,
      MATH_STAGES.length - suffixStart,
      ...structuredClone(donor.manifest.stages.slice(suffixStart))
    );
    await writeJsonAtomic(target.manifestPath, target.manifest);
    process.exitCode = undefined;
    await expect(
      parseMath([
        "quality",
        "check",
        "--lesson",
        requested,
        "--workspace",
        transplantWorkspace,
      ])
    ).rejects.toThrow(/manifest|stage chain/u);
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  it("fails closed for stale or swapped minor-edit approval identity", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "math-cli-approval-"));
    const lessonId = "m5-zo-001-standard";
    await qualityLesson(workspace, lessonId, "minor-edit-review", {
      approval: {
        artifactVersion: "math-minor-approval.v1",
        qualityArtifact: {
          lessonId: "m5-zo-002-standard",
          relativePath: "canonical/quality.json",
          contentHash: "a".repeat(64),
          qualityInputHash: "b".repeat(64),
        },
        decision: "approve-minor-edits",
        requestedByReviewerId: "reviewer-a",
        reviewedByReviewerId: "reviewer-b",
        requestedAt: "2026-07-13T10:00:00.000Z",
        reviewedAt: "2026-07-13T11:00:00.000Z",
      },
    });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    process.exitCode = undefined;
    try {
      await parseMath(["quality", "check", "--lesson", lessonId, "--workspace", workspace]);
      expect(process.exitCode).toBe(3);
      expect(String(stdout.mock.calls.at(-1)?.[0])).toContain(
        '"reason": "approval-evidence-mismatch"'
      );
    } finally {
      process.exitCode = undefined;
      stdout.mockRestore();
    }
  });

  it("publishes only an identity-, locale-, path-, producer-, parent-, and scope-bound dry-run packet", async () => {
    const validWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), "math-cli-packet-valid-"));
    const lessonId = "m5-zo-001-standard";
    await qualityLesson(validWorkspace, lessonId, undefined, { packet: {} });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const writeSpy = vi.spyOn(fs, "writeFile");
    process.exitCode = undefined;
    try {
      await parseMath(["publish", "--lesson", lessonId, "--workspace", validWorkspace, "--language", "de", "--dry-run"]);
      expect(String(stdout.mock.calls.at(-1)?.[0])).toContain(
        '"dispatchAllowed": false'
      );
      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      writeSpy.mockRestore();
      stdout.mockClear();
    }

    const payloadCases = [
      { name: "lesson", expectedExit: 1, selectedLocales: ["de"] as MathLanguage[], packet: { lessonId: "m5-zo-999-standard" } },
      { name: "language", expectedExit: 1, selectedLocales: ["de"] as MathLanguage[], packet: { language: "en" as const } },
      { name: "scope", expectedExit: 1, selectedLocales: ["en"] as MathLanguage[], packet: {} },
      { name: "path", expectedExit: 3, selectedLocales: ["de", "en"] as MathLanguage[], packet: { pathLanguage: "en" as const } },
    ];
    for (const testCase of payloadCases) {
      const workspace = await fs.mkdtemp(path.join(os.tmpdir(), `math-cli-packet-${testCase.name}-`));
      await qualityLesson(workspace, lessonId, undefined, {
        selectedLocales: testCase.selectedLocales,
        packet: testCase.packet,
      });
      process.exitCode = undefined;
      await expect(
        parseMath(["publish", "--lesson", lessonId, "--workspace", workspace, "--language", "de", "--dry-run"])
      ).rejects.toThrow();
      expect(process.exitCode).toBe(testCase.expectedExit);
    }

    for (const mutation of ["producer", "parent", "duplicate"] as const) {
      const workspace = await fs.mkdtemp(path.join(os.tmpdir(), `math-cli-packet-${mutation}-`));
      const built = await qualityLesson(workspace, lessonId, undefined, { packet: {} });
      const metadata = built.manifest.stages.find(
        (stage) => stage.stage === "metadata-playlists"
      )!;
      const packet = metadata.outputArtifacts[0]!;
      if (mutation === "producer") packet.producedBy = "quality-gate";
      if (mutation === "parent") packet.parentHashes = ["f".repeat(64)];
      if (mutation === "duplicate")
        metadata.outputArtifacts.push(structuredClone(packet));
      await writeJsonAtomic(built.manifestPath, built.manifest);
      process.exitCode = undefined;
      await expect(
        parseMath(["publish", "--lesson", lessonId, "--workspace", workspace, "--language", "de", "--dry-run"])
      ).rejects.toThrow();
      expect(process.exitCode).toBe(1);
    }
    for (const mutation of [
      "thumbnail-bytes",
      "media-bytes",
      "binary-owner",
      "binary-size",
      "symlink",
    ] as const) {
      const workspace = await fs.mkdtemp(
        path.join(os.tmpdir(), `math-cli-binary-${mutation}-`)
      );
      const built = await qualityLesson(workspace, lessonId, undefined, {
        packet: {},
      });
      const metadataStage = built.manifest.stages.find(
        (stage) => stage.stage === "metadata-playlists"
      )!;
      const renderStage = built.manifest.stages.find(
        (stage) => stage.stage === "render"
      )!;
      const thumbnail = metadataStage.outputArtifacts.find(
        (artifact) => artifact.schemaVersion === "math-thumbnail-binary.v1"
      )!;
      const media = renderStage.outputArtifacts.find(
        (artifact) => artifact.schemaVersion === "math-final-media-binary.v1"
      )!;
      if (mutation === "thumbnail-bytes")
        await fs.writeFile(path.join(built.lessonRoot, thumbnail.relativePath), "arbitrary");
      if (mutation === "media-bytes")
        await fs.writeFile(path.join(built.lessonRoot, media.relativePath), "swapped-media");
      if (mutation === "binary-owner") thumbnail.producer = "caller";
      if (mutation === "binary-size") media.byteLength += 1;
      if (mutation === "symlink") {
        const target = path.join(built.lessonRoot, thumbnail.relativePath);
        const real = `${target}.real`;
        await fs.rename(target, real);
        await fs.symlink(real, target);
      }
      await writeJsonAtomic(built.manifestPath, built.manifest);
      process.exitCode = undefined;
      await expect(
        parseMath([
          "publish",
          "--lesson",
          lessonId,
          "--workspace",
          workspace,
          "--language",
          "de",
          "--dry-run",
        ])
      ).rejects.toThrow();
      expect(process.exitCode).toBe(1);
    }
    for (const mutation of [
      "quality-path",
      "evidence-path",
      "media-path",
      "packet-quality-hash",
    ] as const) {
      const workspace = await fs.mkdtemp(path.join(os.tmpdir(), `math-cli-canonical-${mutation}-`));
      const built = await qualityLesson(workspace, lessonId, undefined, { packet: {} });
      const metadataStage = built.manifest.stages.find((stage) => stage.stage === "metadata-playlists")!;
      const packetLineage = metadataStage.outputArtifacts.find((artifact) => artifact.schemaVersion === "math-publish-dry-run.v2")!;
      const packetPath = path.join(built.lessonRoot, packetLineage.relativePath);
      const packet = JSON.parse(await fs.readFile(packetPath, "utf8"));
      if (mutation === "quality-path") packet.quality.path = "locales/de/quality.json";
      if (mutation === "evidence-path") packet.finalMedia.evidencePath = "locales/de/render/final-media.json";
      if (mutation === "media-path") packet.finalMedia.mediaPath = "locales/de/final.mp4";
      if (mutation === "packet-quality-hash") packet.finalMedia.qualityEvidenceHash = "0".repeat(64);
      packet.requestFingerprint = canonicalHash({
        identity: packet.identity,
        metadata: packet.metadata,
        thumbnail: packet.thumbnail,
        finalMedia: packet.finalMedia,
        quality: packet.quality,
        brandPolicy: packet.brandPolicy,
        channelId: packet.channelId,
        privacyStatus: packet.privacyStatus,
        madeForKids: packet.madeForKids,
        containsSyntheticMedia: packet.containsSyntheticMedia,
        playlistAssignments: packet.playlistAssignments,
      });
      await writeJsonAtomic(packetPath, packet);
      packetLineage.contentHash = await hashFile(packetPath);
      packetLineage.byteLength = (await fs.stat(packetPath)).size;
      await writeJsonAtomic(built.manifestPath, built.manifest);
      process.exitCode = undefined;
      await expect(parseMath(["publish", "--lesson", lessonId, "--workspace", workspace, "--language", "de", "--dry-run"])).rejects.toThrow();
      expect(process.exitCode).toBe(1);
    }
    {
      const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "math-cli-placeholder-override-"));
      const built = await qualityLesson(workspace, lessonId, undefined, { packet: {} });
      const metadataStage = built.manifest.stages.find((stage) => stage.stage === "metadata-playlists")!;
      const thumbnailLineage = metadataStage.outputArtifacts.find((artifact) => artifact.schemaVersion === "math-thumbnail.v1")!;
      const thumbnailPath = path.join(built.lessonRoot, thumbnailLineage.relativePath);
      const thumbnail = JSON.parse(await fs.readFile(thumbnailPath, "utf8"));
      thumbnail.teacherVersion = "alex.v1-placeholder";
      thumbnail.artwork = {
        status: "approved-publish-artwork",
        publishReady: true,
        blockers: [],
        license: "Forged approval",
        provenance: "Forged approval",
      };
      await writeJsonAtomic(thumbnailPath, thumbnail);
      thumbnailLineage.contentHash = await hashFile(thumbnailPath);
      thumbnailLineage.byteLength = (await fs.stat(thumbnailPath)).size;
      const packetLineage = metadataStage.outputArtifacts.find((artifact) => artifact.schemaVersion === "math-publish-dry-run.v2")!;
      const packetPath = path.join(built.lessonRoot, packetLineage.relativePath);
      const packet = JSON.parse(await fs.readFile(packetPath, "utf8"));
      packet.thumbnail.manifestHash = thumbnailLineage.contentHash;
      packet.requestFingerprint = canonicalHash({
        identity: packet.identity,
        metadata: packet.metadata,
        thumbnail: packet.thumbnail,
        finalMedia: packet.finalMedia,
        quality: packet.quality,
        brandPolicy: packet.brandPolicy,
        channelId: packet.channelId,
        privacyStatus: packet.privacyStatus,
        madeForKids: packet.madeForKids,
        containsSyntheticMedia: packet.containsSyntheticMedia,
        playlistAssignments: packet.playlistAssignments,
      });
      await writeJsonAtomic(packetPath, packet);
      packetLineage.contentHash = await hashFile(packetPath);
      packetLineage.byteLength = (await fs.stat(packetPath)).size;
      await writeJsonAtomic(built.manifestPath, built.manifest);
      process.exitCode = undefined;
      await expect(parseMath(["publish", "--lesson", lessonId, "--workspace", workspace, "--language", "de", "--dry-run"])).rejects.toThrow(/placeholder/u);
      expect(process.exitCode).toBe(3);
    }
    const source = await fs.readFile("apps/cli/src/math-commands.ts", "utf8");
    expect(source).not.toMatch(/publishYoutubeMedia|createYoutubeClient|googleapis/u);
    process.exitCode = undefined;
    stdout.mockRestore();
  });

  it("rejects math publish without --dry-run as input error 1", async () => {
    process.exitCode = undefined;
    await expect(
      parseMath(["publish", "--lesson", "m5-zo-001-standard", "--workspace", "/tmp/unused"])
    ).rejects.toThrow(/requires --dry-run/u);
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });
});
