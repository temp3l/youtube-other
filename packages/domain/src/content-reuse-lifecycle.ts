import {
  ASSET_REFERENCE_MODES,
  assetDescriptorSchema,
  assetReuseEligibilitySchema,
  episodeAssetReferenceAttachInputSchema,
  episodeAssetReferenceRecordSchema,
  episodeCloneResultSchema,
  productionTemplateApplyResultSchema,
  productionTemplateBindingSchema,
  productionTemplateRecordSchema,
  productionTemplateSnapshotSchema,
  reusableAssetRecordSchema,
  type AssetDescriptor,
  type AssetReuseEligibility,
  type CloneCopyPolicy,
  type EpisodeAssetReferenceAttachInput,
  type EpisodeCloneResult,
  type OmittedCloneAsset,
  type ProductionTemplateBinding,
  type ProductionTemplateRecord,
  type ProductionTemplateSnapshot,
} from "./content-reuse-contracts.js";

/** Runtime identity fields that must never be copied during clone. */
export const CLONE_RESET_RUNTIME_FIELDS = [
  "workflowRunId",
  "approvalChallengeId",
  "publicationId",
  "productionRevisionId",
  "reviewState",
  "runtimeState",
] as const;

const EPISODE_ASSET_ID_FIELDS: Readonly<
  Record<string, readonly string[]>
> = {
  dark_truth: ["referenceAssetIds"],
  strategic_reinvention: ["sourceAssetIds"],
};

export function parseAssetProvenance(
  provenance: string
): Readonly<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(provenance) as unknown;
    if (typeof parsed === "object" && parsed !== null)
      return parsed as Readonly<Record<string, unknown>>;
  } catch {
    return {};
  }
  return {};
}

export function projectAssetDescriptor(input: {
  readonly assetId: string;
  readonly mimeType: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly lifecycle: string;
  readonly provenance: string;
  readonly ownerProjectId?: string;
}): AssetDescriptor {
  const parsedProvenance = parseAssetProvenance(input.provenance);
  const sharingScope =
    parsedProvenance["sharingScope"] === "workspace" ||
    parsedProvenance["sharingScope"] === "project"
      ? parsedProvenance["sharingScope"]
      : undefined;
  const ownerProjectId =
    typeof parsedProvenance["ownerProjectId"] === "string"
      ? parsedProvenance["ownerProjectId"]
      : input.ownerProjectId;
  return assetDescriptorSchema.parse({
    assetId: input.assetId,
    mimeType: input.mimeType,
    bytes: input.bytes,
    sha256: input.sha256,
    lifecycle: input.lifecycle,
    provenance: input.provenance,
    ...(ownerProjectId ? { ownerProjectId } : {}),
    ...(sharingScope ? { sharingScope } : {}),
  });
}

export function evaluateAssetReuseEligibility(input: {
  readonly asset: AssetDescriptor;
  readonly sourceProjectId: string;
  readonly targetProjectId: string;
  readonly requestedMode?: "reference" | "copy_on_write";
}): AssetReuseEligibility {
  const { asset, sourceProjectId, targetProjectId } = input;
  if (asset.lifecycle === "revoked")
    return assetReuseEligibilitySchema.parse({
      eligible: false,
      reason: "asset_revoked",
    });
  if (asset.lifecycle === "prohibited")
    return assetReuseEligibilitySchema.parse({
      eligible: false,
      reason: "asset_prohibited",
    });
  if (asset.lifecycle === "archived")
    return assetReuseEligibilitySchema.parse({
      eligible: false,
      reason: "asset_archived",
    });
  const crossProject = sourceProjectId !== targetProjectId;
  if (crossProject) {
    if (asset.lifecycle !== "shared" && asset.sharingScope !== "workspace")
      return assetReuseEligibilitySchema.parse({
        eligible: false,
        reason: "asset_not_shared",
      });
  }
  return assetReuseEligibilitySchema.parse({
    eligible: true,
    mode: input.requestedMode ?? "reference",
  });
}

export function listEpisodeAssetIds(content: unknown): readonly string[] {
  if (!content || typeof content !== "object") return [];
  const record = content as Record<string, unknown>;
  const type = typeof record["type"] === "string" ? record["type"] : "";
  const fields = EPISODE_ASSET_ID_FIELDS[type] ?? [];
  const ids: string[] = [];
  for (const field of fields) {
    const value = record[field];
    if (Array.isArray(value))
      for (const entry of value)
        if (typeof entry === "string") ids.push(entry);
  }
  return ids;
}

export function cloneEpisodeContent(input: {
  readonly sourceContent: unknown;
  readonly sourceProjectId: string;
  readonly targetProjectId: string;
  readonly assetCatalog: Readonly<Record<string, AssetDescriptor>>;
  readonly copyPolicy: CloneCopyPolicy;
}): {
  readonly content: unknown;
  readonly omittedAssets: readonly OmittedCloneAsset[];
} {
  const content = structuredClone(input.sourceContent) as Record<string, unknown>;
  const omittedAssets: OmittedCloneAsset[] = [];
  if (
    input.copyPolicy === "content_and_permitted_assets" &&
    typeof content["type"] === "string"
  ) {
    const fields = EPISODE_ASSET_ID_FIELDS[content["type"]] ?? [];
    for (const field of fields) {
      const current = content[field];
      if (!Array.isArray(current)) continue;
      const retained: string[] = [];
      for (const assetId of current) {
        if (typeof assetId !== "string") continue;
        const descriptor = input.assetCatalog[assetId];
        if (!descriptor) {
          omittedAssets.push({ assetId, reason: "asset_not_found" });
          continue;
        }
        const eligibility = evaluateAssetReuseEligibility({
          asset: descriptor,
          sourceProjectId: input.sourceProjectId,
          targetProjectId: input.targetProjectId,
        });
        if (!eligibility.eligible) {
          omittedAssets.push({
            assetId,
            reason: eligibility.reason ?? "asset_not_reusable",
          });
          continue;
        }
        retained.push(assetId);
      }
      content[field] = retained;
    }
  }
  for (const field of CLONE_RESET_RUNTIME_FIELDS)
    if (field in content) delete content[field];
  return { content, omittedAssets };
}

export function projectProductionTemplateRecord(input: {
  readonly workspaceId: string;
  readonly templateId: string;
  readonly name: string;
  readonly profile: ProductionTemplateRecord["profile"];
  readonly revision: number;
  readonly snapshot: ProductionTemplateSnapshot;
  readonly createdAt: string;
  readonly updatedAt: string;
}): ProductionTemplateRecord {
  return productionTemplateRecordSchema.parse({
    schemaVersion: "mediaforge.production-template.v1",
    workspaceId: input.workspaceId,
    templateId: input.templateId,
    name: input.name,
    profile: input.profile,
    revision: input.revision,
    snapshot: productionTemplateSnapshotSchema.parse(input.snapshot),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
}

export function buildProductionTemplateBinding(input: {
  readonly template: ProductionTemplateRecord;
  readonly pinnedRevision: number;
  readonly appliedAt: string;
}): ProductionTemplateBinding {
  if (input.pinnedRevision > input.template.revision)
    throw new Error("Pinned revision exceeds the template revision.");
  return productionTemplateBindingSchema.parse({
    schemaVersion: "mediaforge.production-template-binding.v1",
    templateId: input.template.templateId,
    pinnedRevision: input.pinnedRevision,
    appliedSnapshot: structuredClone(input.template.snapshot),
    appliedAt: input.appliedAt,
  });
}

export function resolvePinnedTemplateSnapshot(input: {
  readonly binding: ProductionTemplateBinding;
  readonly currentTemplate?: ProductionTemplateRecord | null;
}): ProductionTemplateSnapshot {
  return productionTemplateSnapshotSchema.parse(
    structuredClone(input.binding.appliedSnapshot)
  );
}

export function buildProductionTemplateApplyResult(input: {
  readonly binding: ProductionTemplateBinding;
}): ReturnType<typeof productionTemplateApplyResultSchema.parse> {
  return productionTemplateApplyResultSchema.parse({
    binding: input.binding,
    resolvedSnapshot: resolvePinnedTemplateSnapshot({
      binding: input.binding,
      currentTemplate: null,
    }),
  });
}

export function buildEpisodeCloneResult(input: {
  readonly episodeId: string;
  readonly revision: number;
  readonly omittedAssets: readonly OmittedCloneAsset[];
}): EpisodeCloneResult {
  return episodeCloneResultSchema.parse({
    id: input.episodeId,
    revision: input.revision,
    omittedAssets: [...input.omittedAssets],
    resetRuntimeIdentity: true,
  });
}

export function buildAssetReferenceAttachment(input: {
  readonly asset: AssetDescriptor;
  readonly attachmentKey: string;
  readonly mode?: "reference" | "copy_on_write";
  readonly createdAt: string;
}): ReturnType<typeof episodeAssetReferenceRecordSchema.parse> {
  return episodeAssetReferenceRecordSchema.parse({
    schemaVersion: "mediaforge.episode-asset-reference.v1",
    assetId: input.asset.assetId,
    sha256: input.asset.sha256,
    provenance: input.asset.provenance,
    mode: input.mode ?? "reference",
    attachmentKey: input.attachmentKey,
    createdAt: input.createdAt,
  });
}

export function projectReusableAssetRecord(input: {
  readonly asset: AssetDescriptor;
  readonly sourceProjectId: string;
  readonly targetProjectId: string;
  readonly mimeTypeFilter?: string;
}): ReturnType<typeof reusableAssetRecordSchema.parse> | null {
  if (
    input.mimeTypeFilter &&
    input.asset.mimeType !== input.mimeTypeFilter
  )
    return null;
  const eligibility = evaluateAssetReuseEligibility({
    asset: input.asset,
    sourceProjectId: input.sourceProjectId,
    targetProjectId: input.targetProjectId,
  });
  return reusableAssetRecordSchema.parse({
    id: input.asset.assetId,
    mimeType: input.asset.mimeType,
    bytes: input.asset.bytes,
    sha256: input.asset.sha256,
    lifecycle: input.asset.lifecycle,
    provenance: input.asset.provenance,
    eligibility,
  });
}

export function parseEpisodeAssetReferenceAttachInput(
  value: unknown
): EpisodeAssetReferenceAttachInput {
  return episodeAssetReferenceAttachInputSchema.parse(value);
}

export function assertContentReadAccess(permissions: readonly string[]): void {
  if (!permissions.includes("content.read"))
    throw new Error("Content read requires content.read.");
}

export function assertContentWriteAccess(permissions: readonly string[]): void {
  if (!permissions.includes("content.write"))
    throw new Error("Content write requires content.write.");
}

export function defaultAssetReferenceMode(
  requested: EpisodeAssetReferenceAttachInput["mode"]
): "reference" | "copy_on_write" {
  if (requested && ASSET_REFERENCE_MODES.includes(requested)) return requested;
  return "reference";
}
