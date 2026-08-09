import { createHash } from "node:crypto";
import { z } from "zod";
import { hashCanonical } from "../canonical-json.js";

export const SOURCE_SLIDE_DERIVATIVE_SCHEMA_VERSION =
  "veronica-source-slide-derivative.v1" as const;
export const SOURCE_SLIDE_REDESIGN_SOURCE_NOT_DISPLAYABLE =
  "SOURCE_SLIDE_REDESIGN_SOURCE_NOT_DISPLAYABLE";
export const SOURCE_SLIDE_REDESIGN_SOURCE_NOT_IMMUTABLE =
  "SOURCE_SLIDE_REDESIGN_SOURCE_NOT_IMMUTABLE";
export const SOURCE_SLIDE_REDESIGN_LOCALIZED_OVERLAY_REQUIRED =
  "SOURCE_SLIDE_REDESIGN_LOCALIZED_OVERLAY_REQUIRED";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const aspectRatioSchema = z.enum(["16:9", "9:16"]);

export const veronicaSourceSlideDerivativeSchema = z.strictObject({
  schemaVersion: z.literal(SOURCE_SLIDE_DERIVATIVE_SCHEMA_VERSION),
  contentProfileId: z.literal("veronicabenini"),
  derivativeId: z.string().regex(/^slide-derivative-[a-f0-9]{16}$/u),
  sourceAssetId: z.string().min(1),
  sourceChecksum: sha256Schema,
  sourceRevisionId: z.string().min(1),
  aspectRatio: aspectRatioSchema,
  transformationChain: z.array(z.enum(["redesign", "crop", "translation", "composite"])).min(1),
  effectiveConfigurationHash: sha256Schema,
  dependencyIdentity: z.record(z.string().min(1), sha256Schema),
  regenerationReason: z.enum([
    "new-derivative",
    "source-revision-changed",
    "configuration-changed",
    "dependency-changed",
    "localized-overlay-changed",
    "composition-readability-changed",
  ]),
  reuseRationale: z.enum(["new-content", "content-hash-match", "language-independent-visual"]),
  fingerprint: sha256Schema,
  localizedOverlay: z.strictObject({
    language: z.string().min(2),
    text: z.string().min(1),
    reflowed: z.literal(true),
  }).optional(),
});

export type VeronicaSourceSlideDerivative = z.infer<
  typeof veronicaSourceSlideDerivativeSchema
>;

export interface PlanSourceSlideRedesignInput {
  readonly source: {
    readonly assetId: string;
    readonly checksum: string;
    readonly revisionId: string;
    readonly immutableOriginal: true | undefined;
    readonly displayPolicy: "display-allowed" | "context-only" | "forbidden-display" | undefined;
  };
  readonly aspectRatio: "16:9" | "9:16";
  readonly effectiveConfiguration: unknown;
  readonly dependencyIdentity: Readonly<Record<string, string>>;
  readonly regenerationReason: VeronicaSourceSlideDerivative["regenerationReason"];
  readonly textBearing: boolean;
  readonly localizedOverlay?: {
    readonly language: string;
    readonly text: string;
  };
  readonly previousDerivative?: Pick<VeronicaSourceSlideDerivative, "fingerprint">;
}

/**
 * Produces an immutable descriptor for a slide redesign. This deliberately does
 * not rasterize or write the source: renderers consume this provenance contract
 * to materialize a derivative in their existing artifact store.
 */
export function planSourceSlideRedesign(
  input: PlanSourceSlideRedesignInput,
): { readonly derivative: VeronicaSourceSlideDerivative; readonly reused: boolean } {
  if (input.source.displayPolicy !== "display-allowed") {
    throw new Error(SOURCE_SLIDE_REDESIGN_SOURCE_NOT_DISPLAYABLE);
  }
  if (input.source.immutableOriginal !== true) {
    throw new Error(SOURCE_SLIDE_REDESIGN_SOURCE_NOT_IMMUTABLE);
  }
  if (input.textBearing && !input.localizedOverlay?.text.trim()) {
    throw new Error(SOURCE_SLIDE_REDESIGN_LOCALIZED_OVERLAY_REQUIRED);
  }

  const localizedOverlay = input.textBearing
    ? {
        language: input.localizedOverlay!.language,
        text: input.localizedOverlay!.text,
        reflowed: true as const,
      }
    : undefined;
  const transformationChain = [
    "redesign",
    "crop",
    ...(localizedOverlay ? (["translation", "composite"] as const) : []),
  ] as const;
  const fingerprintMaterial = {
    schemaVersion: SOURCE_SLIDE_DERIVATIVE_SCHEMA_VERSION,
    contentProfileId: "veronicabenini",
    sourceAssetId: input.source.assetId,
    sourceChecksum: input.source.checksum,
    sourceRevisionId: input.source.revisionId,
    aspectRatio: input.aspectRatio,
    transformationChain,
    effectiveConfiguration: input.effectiveConfiguration,
    dependencyIdentity: input.dependencyIdentity,
    // Language is deliberately excluded for imagery without embedded text.
    ...(localizedOverlay ? { localizedOverlay } : {}),
  };
  const fingerprint = createHash("sha256").update(hashCanonical(fingerprintMaterial)).digest("hex");
  const reused = input.previousDerivative?.fingerprint === fingerprint;
  const derivative = veronicaSourceSlideDerivativeSchema.parse({
    schemaVersion: SOURCE_SLIDE_DERIVATIVE_SCHEMA_VERSION,
    contentProfileId: "veronicabenini",
    derivativeId: `slide-derivative-${fingerprint.slice(0, 16)}`,
    sourceAssetId: input.source.assetId,
    sourceChecksum: input.source.checksum,
    sourceRevisionId: input.source.revisionId,
    aspectRatio: input.aspectRatio,
    transformationChain,
    effectiveConfigurationHash: createHash("sha256")
      .update(hashCanonical(input.effectiveConfiguration))
      .digest("hex"),
    dependencyIdentity: input.dependencyIdentity,
    regenerationReason: input.regenerationReason,
    reuseRationale: reused
      ? "content-hash-match"
      : localizedOverlay
        ? "new-content"
        : "language-independent-visual",
    fingerprint,
    ...(localizedOverlay ? { localizedOverlay } : {}),
  });
  return { derivative, reused };
}
