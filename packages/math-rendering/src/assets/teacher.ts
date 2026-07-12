import fs from "node:fs/promises";
import path from "node:path";
import { hashFile } from "@mediaforge/shared";
import { z } from "zod";

export const teacherManifestSchema = z.strictObject({
  assetVersion: z.literal("alex.v1-placeholder"),
  characterId: z.literal("alex"),
  license: z.string().min(1),
  provenance: z.string().min(1),
  maxFrameAreaRatio: z.literal(0.25),
  poses: z
    .array(
      z.strictObject({
        poseId: z.string(),
        file: z.string(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
        width: z.literal(800),
        height: z.literal(1200),
        safeArea: z.strictObject({
          left: z.number(),
          right: z.number(),
          top: z.number(),
          bottom: z.number(),
        }),
      })
    )
    .length(7),
});
export async function validateTeacherAssets(
  manifestPath: string
): Promise<void> {
  await loadTeacherManifest(manifestPath);
}

export type TeacherManifest = z.infer<typeof teacherManifestSchema>;

export async function loadTeacherManifest(
  manifestPath: string
): Promise<TeacherManifest> {
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch (error) {
    throw new Error(`Required teacher manifest is missing: ${manifestPath}`, {
      cause: error,
    });
  }
  const manifest = teacherManifestSchema.parse(JSON.parse(raw) as unknown);
  const ids = new Set(manifest.poses.map((pose) => pose.poseId));
  if (ids.size !== 7) throw new Error("Teacher pose ids must be unique.");
  for (const pose of manifest.poses) {
    const filePath = path.resolve(path.dirname(manifestPath), pose.file);
    if (
      !filePath.startsWith(
        `${path.resolve(path.dirname(manifestPath))}${path.sep}`
      )
    )
      throw new Error(
        `Teacher asset path escapes its manifest: ${pose.poseId}`
      );
    if ((await hashFile(filePath)) !== pose.sha256)
      throw new Error(`Teacher asset hash mismatch: ${pose.poseId}`);
  }
  return manifest;
}

export interface TeacherPoseAsset {
  poseId: string;
  svg: string;
  sha256: string;
  areaRatio: number;
}

export async function loadTeacherPose(
  manifestPath: string,
  poseId: string,
  areaRatio: number
): Promise<TeacherPoseAsset> {
  const manifest = await loadTeacherManifest(manifestPath);
  if (
    !Number.isFinite(areaRatio) ||
    areaRatio <= 0 ||
    areaRatio > manifest.maxFrameAreaRatio
  )
    throw new Error("Teacher exceeds 25 percent of the frame.");
  const pose = manifest.poses.find((candidate) => candidate.poseId === poseId);
  if (!pose) throw new Error(`Required teacher pose is missing: ${poseId}`);
  const filePath = path.resolve(path.dirname(manifestPath), pose.file);
  return {
    poseId,
    svg: await fs.readFile(filePath, "utf8"),
    sha256: pose.sha256,
    areaRatio,
  };
}
