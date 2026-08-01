import crypto from "node:crypto";

import { z } from "zod";

import {
  canonicalGenreAnalysisInputSchema,
  type CanonicalGenreAnalysisInput,
  type ProductionBudgetTier,
} from "./contracts.js";
import { DynamicGenreError } from "./errors.js";

const localeSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u);
const inputIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9._-]*$/u);
const sectionSchema = z.strictObject({
  id: inputIdSchema,
  heading: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1).max(30_000),
});
const characterSchema = z.strictObject({
  id: inputIdSchema,
  name: z.string().trim().min(1).max(240),
  facts: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
});
const sourceMetadataSchema = z
  .record(z.string().trim().min(1).max(80), z.string().trim().max(500))
  .refine(
    (value) => Object.keys(value).length <= 30,
    "Source metadata must contain at most 30 entries."
  );

export const completedStoryGenreInputSchema = z.strictObject({
  contentId: inputIdSchema,
  revision: inputIdSchema,
  locale: localeSchema,
  canonicalLanguage: localeSchema.optional(),
  title: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(120_000),
  characters: z.array(characterSchema).max(50).default([]),
  sourceMetadata: sourceMetadataSchema.default({}),
});
export const structuredOutlineGenreInputSchema = z.strictObject({
  contentId: inputIdSchema,
  revision: inputIdSchema,
  locale: localeSchema,
  canonicalLanguage: localeSchema.optional(),
  title: z.string().trim().min(1).max(300),
  sections: z.array(sectionSchema).min(1).max(200),
  characters: z.array(characterSchema).max(50).default([]),
  sourceMetadata: sourceMetadataSchema.default({}),
});
export const genreAnalysisSourceSchema = z.discriminatedUnion("contentType", [
  completedStoryGenreInputSchema.extend({
    contentType: z.literal("completed-story"),
  }),
  structuredOutlineGenreInputSchema.extend({
    contentType: z.literal("structured-outline"),
  }),
]);
export type GenreAnalysisSource = z.input<typeof genreAnalysisSourceSchema>;

function containsUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}
function normalizeText(value: string): string {
  if (containsUnpairedSurrogate(value))
    throw new DynamicGenreError(
      "invalid_analysis_input",
      "Input contains malformed Unicode."
    );
  return value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
}
function normalizeStrings(value: unknown): unknown {
  if (typeof value === "string") return normalizeText(value);
  if (Array.isArray(value)) return value.map(normalizeStrings);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        normalizeText(key),
        normalizeStrings(item),
      ])
    );
  }
  return value;
}
export function stableGenreJson(value: unknown): string {
  if (value === null) return "null";
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  )
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableGenreJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableGenreJson(item)}`).join(",")}}`;
  }
  throw new DynamicGenreError(
    "invalid_analysis_input",
    "Input contains an unsupported value."
  );
}
export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
export function normalizeGenreAnalysisInput(
  source: GenreAnalysisSource
): CanonicalGenreAnalysisInput {
  const parsed = genreAnalysisSourceSchema.safeParse(normalizeStrings(source));
  if (!parsed.success)
    throw new DynamicGenreError(
      "invalid_analysis_input",
      "Genre analysis input is invalid.",
      false,
      parsed.error.issues.map((issue) => issue.message)
    );
  const input = parsed.data;
  const sections =
    input.contentType === "completed-story"
      ? [{ id: "story", body: input.body }]
      : input.sections;
  const contentHash = sha256(
    stableGenreJson({
      contentType: input.contentType,
      title: input.title,
      sections,
      characters: input.characters,
    })
  );
  const candidate = {
    schemaVersion: "1.0" as const,
    contentId: input.contentId,
    revision: input.revision,
    contentType: input.contentType,
    locale: input.locale,
    ...(input.canonicalLanguage === undefined
      ? {}
      : { canonicalLanguage: input.canonicalLanguage }),
    title: input.title,
    sections,
    characters: input.characters,
    sourceMetadata: input.sourceMetadata,
    contentHash,
  };
  const canonical = canonicalGenreAnalysisInputSchema.safeParse(candidate);
  if (!canonical.success)
    throw new DynamicGenreError(
      "invalid_analysis_input",
      "Normalized genre analysis input is invalid.",
      false,
      canonical.error.issues.map((issue) => issue.message)
    );
  return canonical.data;
}
export interface GenreAnalysisCacheIdentity {
  readonly canonicalContentHash: string;
  readonly analyzerSchemaVersion: string;
  readonly promptVersion: string;
  readonly policyVersion: string;
  readonly budgetTier: ProductionBudgetTier;
}
export function buildDynamicGenreCacheKey(
  identity: GenreAnalysisCacheIdentity
): string {
  return sha256(stableGenreJson(identity));
}
