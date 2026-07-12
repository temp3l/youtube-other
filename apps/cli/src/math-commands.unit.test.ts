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
  createArtifactLineage,
  deriveMathQuality,
  qualityCheck,
  saveWorkflowManifest,
  type MathArtifactLineage,
  type MathLanguage,
  type MathQualityCheckId,
  type WorkflowManifest,
} from "@mediaforge/math-education";
import { writeJsonAtomic } from "@mediaforge/shared";

vi.mock("@mediaforge/math-education", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...(await import("../../../packages/math-education/src/curriculum/release.js")),
  ...(await import("../../../packages/math-education/src/orchestration/batch-planner.js")),
  ...(await import("../../../packages/math-education/src/orchestration/math-workspace-paths.js")),
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
      const packetRelativePath = `locales/${pathLanguage}/publish-dry-run.json`;
      await writeJsonAtomic(path.join(lessonRoot, packetRelativePath), {
        artifactVersion: "math-publish-dry-run.v1",
        lessonId: options.packet.lessonId ?? lessonId,
        language: options.packet.language ?? pathLanguage,
        privacyStatus: "private",
        playlistKeys: ["grade-5", "topic-number", "variant-standard"],
        dispatchAllowed: false,
        paidProviderCalled: false,
      });
      const metadataParents = stages.find(
        (stage) => stage.stage === "metadata-playlists"
      )!.parentFingerprints;
      const packetLineage = await createArtifactLineage({
        root: lessonRoot,
        relativePath: packetRelativePath,
        schemaVersion: "math-publish-dry-run.v1",
        parentHashes: metadataParents,
        producedBy: "metadata-playlists",
      });
      stages.find(
        (stage) => stage.stage === "metadata-playlists"
      )!.outputArtifacts.push(packetLineage);
      stages.find(
        (stage) => stage.stage === "metadata-playlists"
      )!.status = "succeeded";
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
    process.exitCode = undefined;
    try {
      await parseMath(["publish", "--lesson", lessonId, "--workspace", validWorkspace, "--language", "de", "--dry-run"]);
      expect(String(stdout.mock.calls.at(-1)?.[0])).toContain(
        '"dispatchAllowed": false'
      );
    } finally {
      stdout.mockClear();
    }

    const payloadCases = [
      { name: "lesson", selectedLocales: ["de"] as MathLanguage[], packet: { lessonId: "m5-zo-999-standard" } },
      { name: "language", selectedLocales: ["de"] as MathLanguage[], packet: { language: "en" as const } },
      { name: "scope", selectedLocales: ["en"] as MathLanguage[], packet: {} },
      { name: "path", selectedLocales: ["de", "en"] as MathLanguage[], packet: { pathLanguage: "en" as const } },
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
      expect(process.exitCode).toBe(1);
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
    process.exitCode = undefined;
    stdout.mockRestore();
  });
});
