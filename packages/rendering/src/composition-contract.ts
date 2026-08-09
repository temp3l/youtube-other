import { createHash } from "node:crypto";
import {
  contentProfileIdSchema,
  normalizeContentProfileId,
  type ContentProfileId,
} from "@mediaforge/domain";
import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

/**
 * Renderer-side handoff for composition descriptors. This is intentionally a
 * validation-only contract: a caller must provide pre-approved derivatives;
 * it does not dispatch a provider or render media.
 */
export const formatCompositionArtifactSchema = z.strictObject({
  schemaVersion: z.literal("veronica-format-composition.v1"),
  contentProfileId: contentProfileIdSchema,
  sceneId: z.string().min(1),
  narrationRevisionId: z.string().min(1),
  visualSemanticRevisionId: z.string().min(1),
  sharedImageIdentity: sha256Schema,
  compositionId: z.string().regex(/^composition-[a-f0-9]{16}$/u),
  compositionRevision: z.string().min(1),
  aspectRatio: z.enum(["16:9", "9:16"]),
  sourceTreatment: z.enum(["redesign", "reflow", "composite"]),
  sourceSlideRedesignId: z.string().min(1),
  cropLayoutRevision: z.string().min(1),
  textLayoutRevision: z.string().min(1),
  safeAreaRevision: z.string().min(1),
  effectiveConfigurationHash: sha256Schema,
  dependencyIdentity: z.record(z.string().min(1), sha256Schema),
  approval: z.strictObject({
    state: z.enum(["draft", "review", "approved", "blocked"]),
    approvalId: z.string().min(1).optional(),
  }),
  provenance: z.strictObject({
    sourceAssetId: z.string().min(1),
    sourceChecksum: sha256Schema,
    sourceRevisionId: z.string().min(1),
  }),
  reuseRationale: z.enum(["new-content", "content-hash-match", "language-independent-visual"]),
  regenerationRationale: z.enum([
    "new-composition",
    "semantic-revision-changed",
    "format-layout-changed",
    "configuration-changed",
    "dependency-changed",
  ]),
  fingerprint: sha256Schema,
});
export type FormatCompositionArtifact = z.infer<typeof formatCompositionArtifactSchema>;

export const independentFormatCompositionHandoffSchema = formatCompositionArtifactSchema;
export type IndependentFormatCompositionHandoff = z.infer<
  typeof independentFormatCompositionHandoffSchema
>;

interface FormatCompositionInput {
  readonly aspectRatio: "16:9" | "9:16";
  readonly compositionRevision: string;
  readonly sourceTreatment: "redesign" | "reflow" | "composite" | "blind-crop";
  readonly sourceSlideRedesignId: string;
  readonly cropLayoutRevision: string;
  readonly textLayoutRevision: string;
  readonly safeAreaRevision: string;
  readonly regenerationRationale: FormatCompositionArtifact["regenerationRationale"];
}

export interface PlanIndependentFormatCompositionsInput {
  readonly contentProfileId: ContentProfileId | "strategic-reinvention" | "veronica-benini";
  readonly sceneId: string;
  readonly narrationRevisionId: string;
  readonly visualSemanticRevisionId: string;
  readonly sharedImageIdentity: string;
  readonly source: FormatCompositionArtifact["provenance"];
  readonly effectiveConfiguration: unknown;
  readonly dependencyIdentity: Readonly<Record<string, string>>;
  readonly approval: FormatCompositionArtifact["approval"];
  readonly formats: readonly [
    Omit<FormatCompositionInput, "aspectRatio"> & { readonly aspectRatio: "16:9" },
    Omit<FormatCompositionInput, "aspectRatio"> & { readonly aspectRatio: "9:16" },
  ];
  readonly previousArtifacts?: readonly Pick<FormatCompositionArtifact, "fingerprint">[];
}

/** Plans immutable descriptors only; it never performs render or provider work. */
export function planIndependentFormatCompositions(
  input: PlanIndependentFormatCompositionsInput,
): readonly FormatCompositionArtifact[] {
  const contentProfileId = contentProfileIdSchema.parse(normalizeContentProfileId(input.contentProfileId));
  const formats = new Map(input.formats.map((format) => [format.aspectRatio, format]));
  if (formats.size !== 2 || !formats.has("16:9") || !formats.has("9:16")) {
    throw new Error("FORMAT_COMPOSITION_MISSING_DERIVATIVE");
  }
  if (input.formats.some((format) => format.sourceTreatment === "blind-crop")) {
    throw new Error("FORMAT_COMPOSITION_BLIND_CROP");
  }
  if (input.formats[0].sourceSlideRedesignId === input.formats[1].sourceSlideRedesignId) {
    throw new Error("FORMAT_COMPOSITION_SHARED_SOURCE_SLIDE");
  }

  const effectiveConfigurationHash = hashCanonical(input.effectiveConfiguration);
  const artifacts = input.formats.map((format) => {
    const fingerprintMaterial = {
      schemaVersion: "veronica-format-composition.v1",
      contentProfileId,
      sceneId: input.sceneId,
      narrationRevisionId: input.narrationRevisionId,
      visualSemanticRevisionId: input.visualSemanticRevisionId,
      sharedImageIdentity: input.sharedImageIdentity,
      aspectRatio: format.aspectRatio,
      compositionRevision: format.compositionRevision,
      sourceTreatment: format.sourceTreatment,
      sourceSlideRedesignId: format.sourceSlideRedesignId,
      cropLayoutRevision: format.cropLayoutRevision,
      textLayoutRevision: format.textLayoutRevision,
      safeAreaRevision: format.safeAreaRevision,
      effectiveConfiguration: input.effectiveConfiguration,
      dependencyIdentity: input.dependencyIdentity,
      provenance: input.source,
    };
    const fingerprint = hashCanonical(fingerprintMaterial);
    const { effectiveConfiguration: _effectiveConfiguration, ...artifactIdentity } = fingerprintMaterial;
    return formatCompositionArtifactSchema.parse({
      ...artifactIdentity,
      compositionId: `composition-${fingerprint.slice(0, 16)}`,
      effectiveConfigurationHash,
      approval: input.approval,
      reuseRationale: input.previousArtifacts?.some((artifact) => artifact.fingerprint === fingerprint)
        ? "content-hash-match"
        : "language-independent-visual",
      regenerationRationale: format.regenerationRationale,
      fingerprint,
    });
  });
  if (artifacts[0]!.compositionId === artifacts[1]!.compositionId) {
    throw new Error("FORMAT_COMPOSITION_SHARED_ID");
  }
  return artifacts;
}

export function assertIndependentFormatCompositionHandoffs(
  handoffs: readonly [IndependentFormatCompositionHandoff, IndependentFormatCompositionHandoff],
): readonly [IndependentFormatCompositionHandoff, IndependentFormatCompositionHandoff] {
  const parsed = handoffs.map((handoff) => independentFormatCompositionHandoffSchema.parse(handoff));
  const [landscape, portrait] = parsed.sort((left, right) => left.aspectRatio.localeCompare(right.aspectRatio));
  if (landscape?.aspectRatio !== "16:9" || portrait?.aspectRatio !== "9:16") {
    throw new Error("FORMAT_COMPOSITION_MISSING_DERIVATIVE");
  }
  for (const key of ["sceneId", "narrationRevisionId", "visualSemanticRevisionId", "sharedImageIdentity"] as const) {
    if (landscape[key] !== portrait[key]) {
      throw new Error(`FORMAT_COMPOSITION_SEMANTIC_MISMATCH:${key}`);
    }
  }
  if (landscape.compositionId === portrait.compositionId) {
    throw new Error("FORMAT_COMPOSITION_SHARED_ID");
  }
  if (landscape.sourceSlideRedesignId === portrait.sourceSlideRedesignId) {
    throw new Error("FORMAT_COMPOSITION_SHARED_SOURCE_SLIDE");
  }
  return [landscape, portrait];
}
