import { createHash } from "node:crypto";
import {
  formatCompositionArtifactSchema,
  type FormatCompositionArtifact,
} from "@mediaforge/rendering/composition-contract.js";
import {
  localeEditionArtifactSchema,
  type LocaleEditionArtifact,
} from "@mediaforge/story-localization/locale-edition";
import { z } from "zod";
import { canonicalJson, hashCanonical } from "../canonical-json.js";
import {
  veronicaRenderManifestSchema,
  type VeronicaRenderManifest,
} from "../contracts/media-plan.v1.js";
import { prepareVeronicaRenderCommands } from "./executor.js";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const identifierSchema = z.string().trim().min(1);

const renderVoiceManifestSchema = z.strictObject({
  schemaVersion: z.literal("creator-supplied-audio-track.v1"),
  source: z.literal("supplied-human"),
  audioPath: z.string().trim().min(1),
  audioFingerprint: sha256Schema,
  timingFingerprint: sha256Schema,
  captionsPath: z.string().trim().min(1).optional(),
  captionsFingerprint: sha256Schema.optional(),
  approval: z.strictObject({
    state: z.literal("approved"),
    approvalIds: z.array(identifierSchema).min(2).refine(
      (approvalIds) => new Set(approvalIds).size === approvalIds.length,
      "Voice approvals must come from distinct actors.",
    ),
    boundRevision: identifierSchema,
  }),
});
export type VeronicaRenderVoiceManifest = z.infer<typeof renderVoiceManifestSchema>;

export const veronicaRenderDerivativeSchema = z.strictObject({
  schemaVersion: z.literal("veronica-render-derivative.v1"),
  contentProfileId: z.literal("veronicabenini"),
  renderId: z.string().regex(/^veronica-render-[a-f0-9]{16}$/u),
  productionRevisionId: identifierSchema,
  locale: identifierSchema,
  aspectRatio: z.enum(["16:9", "9:16"]),
  compositionId: identifierSchema,
  compositionFingerprint: sha256Schema,
  localeEditionId: identifierSchema,
  localeEditionFingerprint: sha256Schema,
  voice: renderVoiceManifestSchema,
  renderManifest: veronicaRenderManifestSchema,
  preview: z.strictObject({
    outputPath: z.string().trim().min(1),
    durationSeconds: z.number().positive(),
    command: z.array(z.string().min(1)).min(1),
    fingerprint: sha256Schema,
  }),
  commandEvidence: z.array(z.array(z.string().min(1)).min(1)).min(1),
  effectiveConfigurationHash: sha256Schema,
  dependencyIdentity: z.record(z.string().min(1), sha256Schema),
  provenance: z.strictObject({
    source: z.literal("approved-composition-locale-voice-manifests"),
    compositionRevision: identifierSchema,
    narrationRevisionId: identifierSchema,
    visualSemanticRevisionId: identifierSchema,
  }),
  reuseRationale: z.enum(["new-content", "content-hash-match"]),
  regenerationRationale: z.enum([
    "new-render",
    "composition-changed",
    "locale-edition-changed",
    "voice-timing-changed",
    "configuration-changed",
    "dependency-changed",
  ]),
  execution: z.strictObject({
    state: z.literal("planned"),
    externalDispatchEnabled: z.literal(false),
  }),
  fingerprint: sha256Schema,
});
export type VeronicaRenderDerivative = z.infer<typeof veronicaRenderDerivativeSchema>;

export interface PlanVeronicaRenderDerivativeInput {
  readonly productionRevisionId: string;
  readonly locale: string;
  readonly composition: FormatCompositionArtifact;
  readonly localeEdition: LocaleEditionArtifact;
  readonly voice: VeronicaRenderVoiceManifest;
  readonly renderManifest: VeronicaRenderManifest;
  readonly previewDurationSeconds: number;
  readonly effectiveConfiguration: unknown;
  readonly dependencyIdentity: Readonly<Record<string, string>>;
  readonly regenerationRationale: VeronicaRenderDerivative["regenerationRationale"];
  readonly previousArtifact?: VeronicaRenderDerivative;
}

function assertApprovedInputs(
  composition: FormatCompositionArtifact,
  edition: LocaleEditionArtifact,
): void {
  if (composition.contentProfileId !== "veronicabenini") {
    throw new Error("VERONICA_RENDER_PROFILE_INVALID");
  }
  if (
    edition.contentProfileId !== "veronicabenini" ||
    composition.approval.state !== "approved" ||
    edition.approval.state !== "approved"
  ) {
    throw new Error("VERONICA_RENDER_APPROVAL_REQUIRED");
  }
}

function previewPath(outputPath: string): string {
  return outputPath.replace(/\.mp4$/u, ".preview.mp4");
}

function previewCommand(outputPath: string, durationSeconds: number, target: string): readonly string[] {
  return ["-y", "-i", outputPath, "-t", String(durationSeconds), "-an", "-c:v", "libx264", target];
}

/**
 * Plans an immutable Veronica render derivative.  It intentionally does not
 * dispatch FFmpeg: callers can submit this evidence to a separately approved
 * execution boundary after all approvals remain current.
 */
export function planVeronicaRenderDerivative(
  input: PlanVeronicaRenderDerivativeInput,
): { readonly artifact: VeronicaRenderDerivative; readonly reused: boolean } {
  const composition = formatCompositionArtifactSchema.parse(input.composition);
  const localeEdition = localeEditionArtifactSchema.parse(input.localeEdition);
  const voice = renderVoiceManifestSchema.parse(input.voice);
  const renderManifest = veronicaRenderManifestSchema.parse(input.renderManifest);
  assertApprovedInputs(composition, localeEdition);
  if (composition.aspectRatio !== renderManifest.aspectRatio) {
    throw new Error("VERONICA_RENDER_ASPECT_MISMATCH");
  }
  if (renderManifest.narrationAudioPath !== voice.audioPath) {
    throw new Error("VERONICA_RENDER_VOICE_AUDIO_MISMATCH");
  }
  if (
    renderManifest.canonicalContentIdentity.locale !== input.locale ||
    renderManifest.canonicalContentIdentity.storyId !== localeEdition.episodeId
  ) {
    throw new Error("VERONICA_RENDER_CANONICAL_IDENTITY_MISMATCH");
  }
  if (localeEdition.locale !== input.locale || localeEdition.productionRevisionId !== input.productionRevisionId) {
    throw new Error("VERONICA_RENDER_LOCALE_REVISION_MISMATCH");
  }
  if (!localeEdition.sharedVisuals.some(
    (visual) =>
      visual.artifactId === composition.compositionId &&
      visual.fingerprint === composition.fingerprint,
  )) {
    throw new Error("VERONICA_RENDER_COMPOSITION_LINEAGE_MISMATCH");
  }
  if (!renderManifest.outputPath.endsWith(".mp4")) {
    throw new Error("VERONICA_RENDER_OUTPUT_INVALID");
  }
  const commands = prepareVeronicaRenderCommands(renderManifest);
  const targetPreviewPath = previewPath(renderManifest.outputPath);
  const preview = {
    outputPath: targetPreviewPath,
    durationSeconds: input.previewDurationSeconds,
    command: previewCommand(renderManifest.outputPath, input.previewDurationSeconds, targetPreviewPath),
  };
  const material = {
    schemaVersion: "veronica-render-derivative.v1" as const,
    contentProfileId: "veronicabenini" as const,
    productionRevisionId: input.productionRevisionId,
    locale: input.locale,
    aspectRatio: composition.aspectRatio,
    compositionId: composition.compositionId,
    compositionFingerprint: composition.fingerprint,
    localeEditionId: localeEdition.editionId,
    localeEditionFingerprint: localeEdition.fingerprint,
    voice,
    renderManifest,
    preview,
    commandEvidence: commands,
    effectiveConfiguration: input.effectiveConfiguration,
    dependencyIdentity: input.dependencyIdentity,
    provenance: {
      source: "approved-composition-locale-voice-manifests" as const,
      compositionRevision: composition.compositionRevision,
      narrationRevisionId: composition.narrationRevisionId,
      visualSemanticRevisionId: composition.visualSemanticRevisionId,
    },
  };
  const fingerprint = hashCanonical(material);
  const reused = input.previousArtifact?.fingerprint === fingerprint;
  const { effectiveConfiguration: _effectiveConfiguration, preview: previewMaterial, ...persisted } = material;
  return {
    artifact: veronicaRenderDerivativeSchema.parse({
      ...persisted,
      renderId: `veronica-render-${fingerprint.slice(0, 16)}`,
      preview: { ...previewMaterial, fingerprint: hashCanonical(previewMaterial) },
      effectiveConfigurationHash: hashCanonical(input.effectiveConfiguration),
      reuseRationale: reused ? "content-hash-match" : "new-content",
      regenerationRationale: input.regenerationRationale,
      execution: { state: "planned", externalDispatchEnabled: false },
      fingerprint,
    }),
    reused,
  };
}

/** Failure evidence intentionally contains only identifiers and safe error codes. */
export function redactVeronicaRenderDerivativeFailure(error: unknown): {
  readonly code: string;
  readonly message: string;
  readonly evidenceFingerprint: string;
} {
  const message = error instanceof Error ? error.message : "VERONICA_RENDER_INVALID";
  const code = /^VERONICA_RENDER_[A-Z_]+$/u.test(message)
    ? message
    : "VERONICA_RENDER_INVALID";
  return {
    code,
    message: "Render planning was blocked; inspect approved manifest identities and dependency evidence.",
    evidenceFingerprint: createHash("sha256").update(canonicalJson({ code })).digest("hex"),
  };
}
