import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hashFile } from "@mediaforge/shared";
import { describe, expect, it } from "vitest";
import {
  createArtifactLineage,
  loadWorkflowManifest,
  MATH_STAGES,
  outputsAreValid,
  saveWorkflowManifest,
  stageFingerprint,
  withMathFileLock,
  type WorkflowManifest,
} from "./workflow.js";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "math-workflow-"));
}

async function manifestWithOutputs(root: string, names = ["a.json", "b.json"]) {
  const parents = ["a".repeat(64), "b".repeat(64)];
  await Promise.all(
    names.map((name, index) =>
      fs.writeFile(
        path.join(root, name),
        JSON.stringify({
          artifactVersion: "math-quality.v1",
          status: index === 0 ? "READY" : "PUBLISH_BLOCKED",
          publishable: index === 0,
          checks: [],
        }),
        "utf8"
      )
    )
  );
  const artifacts = await Promise.all(
    names.map((relativePath) =>
      createArtifactLineage({
        root,
        relativePath,
        schemaVersion: "math-quality.v1",
        parentHashes: parents,
        producedBy: "quality-gate",
      })
    )
  );
  const now = new Date().toISOString();
  const manifest: WorkflowManifest = {
    artifactVersion: "math-workflow.v2",
    lessonId: "m5-zo-001-standard",
    curriculumReleaseId: "de-gems-5-10-v1",
    simulated: true,
    paidProviderCalled: false,
    stages: MATH_STAGES.map((stage) => ({
      stage,
      status: stage === "quality-gate" ? "succeeded" : "planned",
      fingerprint: stageFingerprint(stage, parents, {}),
      parentFingerprints: parents,
      outputArtifacts: stage === "quality-gate" ? artifacts : [],
      updatedAt: now,
    })),
    failures: [],
  };
  return manifest;
}

describe("math workflow store", () => {
  it("requires every output hash and the exact parent hashes", async () => {
    for (const mutation of ["delete", "truncate", "swap"] as const) {
      const root = await tempRoot();
      const manifest = await manifestWithOutputs(root);
      const quality = manifest.stages.find(
        (stage) => stage.stage === "quality-gate"
      )!;
      expect(await outputsAreValid(root, quality)).toBe(true);
      if (mutation === "delete") await fs.unlink(path.join(root, "a.json"));
      if (mutation === "truncate")
        await fs.writeFile(path.join(root, "a.json"), "", "utf8");
      if (mutation === "swap")
        await fs.rename(path.join(root, "b.json"), path.join(root, "a.json"));
      expect(await outputsAreValid(root, quality)).toBe(false);
    }
    const root = await tempRoot();
    const manifest = await manifestWithOutputs(root);
    const quality = manifest.stages.find(
      (stage) => stage.stage === "quality-gate"
    )!;
    expect(await outputsAreValid(root, quality, ["c".repeat(64)])).toBe(false);
    await fs.writeFile(
      path.join(root, "a.json"),
      JSON.stringify({ artifactVersion: "math-quality.v1" }),
      "utf8"
    );
    const invalidHash = await hashFile(path.join(root, "a.json"));
    const schemaWrong = {
      ...quality,
      outputArtifacts: quality.outputArtifacts.map((artifact) =>
        artifact.relativePath === "a.json"
          ? { ...artifact, contentHash: invalidHash }
          : artifact
      ),
    };
    expect(await outputsAreValid(root, schemaWrong)).toBe(false);
  });

  it("quarantines malformed manifests and fail-stale migrates v1", async () => {
    const root = await tempRoot();
    const filePath = path.join(root, "manifest.json");
    await fs.writeFile(filePath, "{broken", "utf8");
    await expect(loadWorkflowManifest(filePath)).rejects.toMatchObject({
      name: "MathWorkflowManifestError",
    });
    expect(
      (await fs.readdir(root)).some((name) => name.includes(".corrupt-"))
    ).toBe(true);

    const now = new Date().toISOString();
    await fs.writeFile(
      filePath,
      JSON.stringify({
        artifactVersion: "math-workflow.v1",
        lessonId: "m5-zo-001-standard",
        curriculumReleaseId: "de-gems-5-10-v1",
        simulated: true,
        paidProviderCalled: false,
        stages: MATH_STAGES.map((stage) => ({
          stage,
          status: "succeeded",
          fingerprint: "a".repeat(64),
          outputPaths: [],
          updatedAt: now,
        })),
        failures: [],
      }),
      "utf8"
    );
    const migrated = await loadWorkflowManifest(filePath);
    expect(migrated?.artifactVersion).toBe("math-workflow.v2");
    expect(migrated?.stages.every((stage) => stage.status === "stale")).toBe(
      true
    );
  });

  it("writes atomically and rejects a concurrent lock", async () => {
    const root = await tempRoot();
    const manifest = await manifestWithOutputs(root);
    const manifestPath = path.join(root, "manifest.json");
    await saveWorkflowManifest(manifestPath, manifest);
    expect((await loadWorkflowManifest(manifestPath))?.artifactVersion).toBe(
      "math-workflow.v2"
    );
    const lockPath = path.join(root, "workflow.lock");
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let release!: () => void;
    const held = withMathFileLock(lockPath, () => {
      markStarted();
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    await started;
    await expect(
      withMathFileLock(lockPath, async () => undefined)
    ).rejects.toThrow(/already held/u);
    release();
    await held;
  });
});
