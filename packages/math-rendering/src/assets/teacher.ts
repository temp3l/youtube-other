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
  const manifest = teacherManifestSchema.parse(
    JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown
  );
  const ids = new Set(manifest.poses.map((pose) => pose.poseId));
  if (ids.size !== 7) throw new Error("Teacher pose ids must be unique.");
  for (const pose of manifest.poses) {
    const filePath = path.resolve(path.dirname(manifestPath), pose.file);
    if ((await hashFile(filePath)) !== pose.sha256)
      throw new Error(`Teacher asset hash mismatch: ${pose.poseId}`);
  }
}
