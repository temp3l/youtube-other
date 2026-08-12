import { createHash } from "node:crypto";

import { z } from "zod";

export const NARRATIVE_SCHEMA_VERSION = "mediaforge.narrative.v1" as const;

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;

export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
export const sha256Schema = z.string().regex(sha256Pattern);
export const nonEmptyStringSchema = z.string().trim().min(1);

export function brandedIdentifier<TBrand extends string>(brand: TBrand) {
  return identifierSchema.brand<TBrand>();
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return JSON.stringify(Number.isFinite(value) ? value : null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    return `{${entries
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  throw new Error("Unsupported value in narrative canonical serialization.");
}

export function computePayloadHash(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
}

export const boundedScoreSchema = z.number().min(-100).max(100);

export const provenanceSchema = z
  .object({
    sourceKind: z.enum([
      "import",
      "operator_edit",
      "compilation",
      "acceptance",
      "planning",
    ]),
    sourceRevisionIds: z.array(identifierSchema).optional(),
    sourceArtifactHashes: z.array(sha256Schema).optional(),
    notes: z.string().max(2_000).optional(),
  })
  .strict();
export type NarrativeProvenance = z.infer<typeof provenanceSchema>;
