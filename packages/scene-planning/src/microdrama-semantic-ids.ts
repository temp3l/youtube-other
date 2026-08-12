import { z } from "zod";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;

export const beatSemanticIdSchema = z
  .string()
  .regex(/^beat\.sem\.e\d{3}\.[a-z_]+$/u);
export type BeatSemanticId = z.infer<typeof beatSemanticIdSchema>;

export const sceneSemanticIdSchema = z
  .string()
  .regex(/^scene\.sem\.e\d{3}\.\d{3}$/u);
export type SceneSemanticId = z.infer<typeof sceneSemanticIdSchema>;

export const shotSemanticIdSchema = z
  .string()
  .regex(/^shot\.sem\.e\d{3}\.\d{3}\.\d{3}$/u);
export type ShotSemanticId = z.infer<typeof shotSemanticIdSchema>;

export const sourcePlateSemanticIdSchema = z
  .string()
  .regex(/^plate\.sem\.e\d{3}\.\d{3}$/u);
export type SourcePlateSemanticId = z.infer<typeof sourcePlateSemanticIdSchema>;

export function beatSemanticId(
  canonicalEpisodeId: string,
  beatCategory: string
): BeatSemanticId {
  return beatSemanticIdSchema.parse(
    `beat.sem.${canonicalEpisodeId.toLowerCase()}.${beatCategory.toLowerCase()}`
  );
}

export function sceneSemanticId(
  canonicalEpisodeId: string,
  sceneOrder: number
): SceneSemanticId {
  return sceneSemanticIdSchema.parse(
    `scene.sem.${canonicalEpisodeId.toLowerCase()}.${String(sceneOrder).padStart(3, "0")}`
  );
}

export function shotSemanticId(
  canonicalEpisodeId: string,
  sceneOrder: number,
  shotOrder: number
): ShotSemanticId {
  return shotSemanticIdSchema.parse(
    `shot.sem.${canonicalEpisodeId.toLowerCase()}.${String(sceneOrder).padStart(3, "0")}.${String(shotOrder).padStart(3, "0")}`
  );
}

export function sourcePlateSemanticId(
  canonicalEpisodeId: string,
  plateOrder: number
): SourcePlateSemanticId {
  return sourcePlateSemanticIdSchema.parse(
    `plate.sem.${canonicalEpisodeId.toLowerCase()}.${String(plateOrder).padStart(3, "0")}`
  );
}

export function slugifyRegistryEntryId(kind: string, displayName: string): string {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return z.string().regex(identifierPattern).parse(`${kind}.${slug || "unknown"}`);
}

export function semanticIdContainsEnglishSentenceIdentity(value: string): boolean {
  return /\s/u.test(value) || /[A-Z]/u.test(value);
}
