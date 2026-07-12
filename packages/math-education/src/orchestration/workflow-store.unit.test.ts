import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hashFile } from "@mediaforge/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { canonicalHash } from "../verification/canonical-json.js";
import { parseMathArtifactPayload } from "./artifact-schemas.js";
import {
  createArtifactLineage,
  loadWorkflowManifest,
  MATH_STAGES,
  outputsAreValid,
  readAuthoritativeStageArtifact,
  saveWorkflowManifest,
  stageFingerprint,
  withMathFileLock,
  workflowManifestSchema,
  type WorkflowManifest,
} from "./workflow.js";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "math-workflow-"));
}

async function manifestWithOutputs(root: string, names = ["a.json", "b.json"]) {
  const now = new Date().toISOString();
  let parents = [canonicalHash({ root: path.basename(root) })];
  const stages = MATH_STAGES.map((stage) => {
    const fingerprint = stageFingerprint(stage, parents, {
      lessonId: "m5-zo-001-standard",
    });
    const record = {
      stage,
      status: stage === "quality-gate" ? ("succeeded" as const) : ("planned" as const),
      fingerprint,
      parentFingerprints: parents,
      outputArtifacts: [],
      updatedAt: now,
    };
    parents = [fingerprint];
    return record;
  });
  const quality = stages.find((stage) => stage.stage === "quality-gate")!;
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
        parentHashes: quality.parentFingerprints,
        producedBy: "quality-gate",
      })
    )
  );
  const manifest: WorkflowManifest = {
    artifactVersion: "math-workflow.v2",
    lessonId: "m5-zo-001-standard",
    curriculumReleaseId: "de-gems-5-10-v1",
    simulated: true,
    paidProviderCalled: false,
    stages: stages.map((record) =>
      record.stage === "quality-gate"
        ? { ...record, outputArtifacts: artifacts }
        : record
    ),
    failures: [],
  };
  return manifest;
}

describe("math workflow store", () => {
  it("reads legacy narration as compatibility-only and hash-validates v2", async () => {
    const root = await tempRoot();
    const segmentsV1 = Array.from({ length: 9 }, (_, index) => ({
      segmentId: `segment-${String(index + 1).padStart(3, "0")}`,
      sceneId: `scene-${String(index + 1).padStart(3, "0")}`,
      sceneFunction: "fixture",
      text: "legacy text",
      factIds: [],
    }));
    const legacy = {
      artifactVersion: "math-narration.v1",
      language: "de",
      lessonId: "m5-zo-001-standard",
      objectiveHash: "a".repeat(64),
      factLockHash: "b".repeat(64),
      segments: segmentsV1,
      glossaryVersion: "math-glossary.v1",
      contentHash: "c".repeat(64),
    };
    expect(() =>
      parseMathArtifactPayload("math-narration.v1", legacy)
    ).not.toThrow();
    await fs.writeFile(
      path.join(root, "legacy.json"),
      JSON.stringify(legacy),
      "utf8"
    );
    const legacyLineage = await createArtifactLineage({
      root,
      relativePath: "legacy.json",
      schemaVersion: "math-narration.v1",
      parentHashes: [],
      producedBy: "localization",
    });
    expect(
      await outputsAreValid(root, {
        stage: "localization",
        status: "succeeded",
        fingerprint: "d".repeat(64),
        parentFingerprints: [],
        outputArtifacts: [legacyLineage],
        updatedAt: new Date().toISOString(),
      })
    ).toBe(false);

    const segmentsV2 = segmentsV1.map(({ text: _text, ...segment }) => ({
      ...segment,
      tokenizedText: "[[fact:value]]",
      displayText: "1",
      spokenText: "1",
      factIds: ["value"],
    }));
    const v2Content = {
      artifactVersion: "math-narration.v2" as const,
      language: "de" as const,
      region: "DE" as const,
      lessonId: "m5-zo-001-standard",
      variant: "standard" as const,
      objectiveHash: "a".repeat(64),
      factLockHash: "b".repeat(64),
      glossaryVersion: "math-glossary.v1" as const,
      glossaryHash: "c".repeat(64),
      resolvedFacts: [
        {
          factId: "value",
          semanticHash: "d".repeat(64),
          display: "1",
          spoken: "1",
          latex: "1",
        },
      ],
      segments: segmentsV2,
    };
    const v2 = { ...v2Content, contentHash: canonicalHash(v2Content) };
    expect(() =>
      parseMathArtifactPayload("math-narration.v2", v2)
    ).not.toThrow();
    expect(() =>
      parseMathArtifactPayload("math-narration.v2", {
        ...v2,
        resolvedFacts: [{ ...v2.resolvedFacts[0], display: "2" }],
      })
    ).toThrow(/content hash/u);
  });

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

  it("requires the canonical stage chain and exactly one owned output", async () => {
    const root = await tempRoot();
    const manifest = await manifestWithOutputs(root, ["a.json"]);
    await expect(
      readAuthoritativeStageArtifact({
        root,
        manifest,
        stage: "quality-gate",
        relativePath: "a.json",
        schemaVersion: "math-quality.v1",
        schema: z.unknown(),
      })
    ).resolves.toMatchObject({ artifactVersion: "math-quality.v1" });

    const duplicateOutput = structuredClone(manifest);
    const quality = duplicateOutput.stages.find(
      (record) => record.stage === "quality-gate"
    )!;
    quality.outputArtifacts.push(structuredClone(quality.outputArtifacts[0]!));
    await expect(
      readAuthoritativeStageArtifact({
        root,
        manifest: duplicateOutput,
        stage: "quality-gate",
        relativePath: "a.json",
        schemaVersion: "math-quality.v1",
        schema: z.unknown(),
      })
    ).rejects.toThrow(/exactly one/u);
  });

  it("rejects missing, duplicated, reordered, or alternatively parented chain data", async () => {
    const root = await tempRoot();
    const manifest = await manifestWithOutputs(root, ["a.json"]);
    for (const mutate of [
      (candidate: WorkflowManifest) => candidate.stages.splice(3, 1),
      (candidate: WorkflowManifest) => candidate.stages.splice(3, 0, structuredClone(candidate.stages[3]!)),
      (candidate: WorkflowManifest) => candidate.stages.splice(2, 2, candidate.stages[3]!, candidate.stages[2]!),
      (candidate: WorkflowManifest) => { candidate.stages[5]!.parentFingerprints = []; },
      (candidate: WorkflowManifest) => { candidate.stages[5]!.parentFingerprints.push("f".repeat(64)); },
      (candidate: WorkflowManifest) => { candidate.stages[5]!.parentFingerprints.push(candidate.stages[5]!.parentFingerprints[0]!); },
    ]) {
      const candidate = structuredClone(manifest);
      mutate(candidate);
      expect(workflowManifestSchema.safeParse(candidate).success).toBe(false);
    }

    const reorderedParents = structuredClone(manifest);
    const quality = reorderedParents.stages.find(
      (record) => record.stage === "quality-gate"
    )!;
    quality.parentFingerprints = ["e".repeat(64), quality.parentFingerprints[0]!];
    quality.outputArtifacts[0]!.parentHashes = [...quality.parentFingerprints].reverse();
    expect(workflowManifestSchema.safeParse(reorderedParents).success).toBe(false);
  });

  it("rejects an internally consistent transplanted stage suffix", async () => {
    const firstRoot = await tempRoot();
    const secondRoot = await tempRoot();
    const first = await manifestWithOutputs(firstRoot, ["a.json"]);
    const second = await manifestWithOutputs(secondRoot, ["a.json"]);
    const suffixStart = MATH_STAGES.indexOf("quality-gate");
    const transplanted = structuredClone(first);
    transplanted.stages.splice(
      suffixStart,
      MATH_STAGES.length - suffixStart,
      ...structuredClone(second.stages.slice(suffixStart))
    );
    expect(workflowManifestSchema.safeParse(transplanted).success).toBe(false);
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
