import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { fileExists, hashFile, hashText, writeJsonAtomic } from "@mediaforge/shared";

/** A deliberately narrow, versioned contract for safe cross-episode reuse. */
export const VERONICA_REUSABLE_IMAGE_DESCRIPTOR_VERSION = 1 as const;
export const VERONICA_REUSABLE_IMAGE_REGISTRY_VERSION = 1 as const;

export interface VeronicaReusableImageSemanticsV1 {
  readonly visualIntent: string;
  readonly semanticBeat: string;
  readonly subjectArchetypes: readonly string[];
  readonly actions: readonly string[];
  readonly settingArchetype?: string | undefined;
  readonly compositionArchetype?: string | undefined;
  readonly evidenceMode?: string | undefined;
  readonly aspectRatio: string;
  readonly visualContractVersion: string;
  readonly containsVisibleText: boolean;
  readonly containsEpisodeSpecificText: boolean;
  readonly containsNamedPerson: boolean;
  readonly containsNamedBrand: boolean;
  readonly usesReferenceImage: boolean;
  readonly localizationSensitive: boolean;
  readonly continuitySensitive: boolean;
  readonly identitySensitive: boolean;
  readonly uniqueEvidence: boolean;
  readonly uniqueProductIdentity: boolean;
  readonly materialEditingMask: boolean;
  readonly occupationNeutral: boolean;
  readonly occupationCues: readonly string[];
  readonly permittedOccupationCues: readonly string[];
  readonly reuseEligibility: "eligible" | "restricted" | "forbidden";
}

export interface VeronicaReusableImageDescriptorV1 extends VeronicaReusableImageSemanticsV1 {
  readonly schemaVersion: 1;
  readonly assetId: string;
  readonly assetHash: string;
  /** Path relative to the supplied workspace root. */
  readonly relativePath: string;
  readonly sourceEpisodeId: string;
  readonly sourceSceneId: string;
  readonly semanticFingerprint: string;
  readonly generationFingerprint: string;
  readonly reuseCount: number;
}

export interface VeronicaGeneratedImageReusePolicy {
  readonly semanticCrossEpisodeReuse: boolean;
  readonly maxCrossEpisodeReusedAssetsPerEpisode: number;
  readonly forbidAdjacentReuse: boolean;
  readonly maxUsesPerAssetPerEpisode: number;
}

export const defaultVeronicaGeneratedImageReusePolicy: VeronicaGeneratedImageReusePolicy = {
  semanticCrossEpisodeReuse: true,
  maxCrossEpisodeReusedAssetsPerEpisode: 2,
  forbidAdjacentReuse: true,
  maxUsesPerAssetPerEpisode: 1,
};

const stringList = z.array(z.string().min(1)).transform((values) => [...new Set(values.map(normalize))].sort());
const semanticsSchema = z.object({
  visualIntent: z.string().min(1), semanticBeat: z.string().min(1), subjectArchetypes: stringList,
  actions: stringList, settingArchetype: z.string().min(1).optional(), compositionArchetype: z.string().min(1).optional(),
  evidenceMode: z.string().min(1).optional(), aspectRatio: z.string().min(1), visualContractVersion: z.string().min(1),
  containsVisibleText: z.boolean(), containsEpisodeSpecificText: z.boolean(), containsNamedPerson: z.boolean(),
  containsNamedBrand: z.boolean(), usesReferenceImage: z.boolean(), localizationSensitive: z.boolean(), continuitySensitive: z.boolean(),
  identitySensitive: z.boolean(), uniqueEvidence: z.boolean(), uniqueProductIdentity: z.boolean(), materialEditingMask: z.boolean(),
  occupationNeutral: z.boolean(), occupationCues: stringList, permittedOccupationCues: stringList,
  reuseEligibility: z.enum(["eligible", "restricted", "forbidden"]),
}).strict();
const descriptorSchema: z.ZodType<VeronicaReusableImageDescriptorV1> = semanticsSchema.extend({
  schemaVersion: z.literal(1), assetId: z.string().min(1), assetHash: z.string().regex(/^[a-f0-9]{64}$/u),
  relativePath: z.string().min(1), sourceEpisodeId: z.string().min(1), sourceSceneId: z.string().min(1),
  semanticFingerprint: z.string().regex(/^[a-f0-9]{64}$/u), generationFingerprint: z.string().min(1), reuseCount: z.number().int().nonnegative(),
});
const registryEnvelopeSchema = z.object({ schemaVersion: z.literal(1), assets: z.array(z.unknown()) }).strict();

export type VeronicaReuseRejectionReason =
  | "FORCED" | "DISABLED" | "TARGET_INELIGIBLE" | "EPISODE_BUDGET_EXHAUSTED"
  | "NO_COMPATIBLE_CANDIDATE" | "REGISTRY_INVALID" | "STALE_ASSET" | "HARD_GUARD";
export type VeronicaReuseDecision =
  | { readonly kind: "reuse"; readonly asset: VeronicaReusableImageDescriptorV1; readonly reason: "EXACT_SEMANTIC_FINGERPRINT" | "EXACT_STRUCTURED_SEMANTICS"; readonly rejectedCandidates: readonly VeronicaReuseRejectionReason[] }
  | { readonly kind: "generate"; readonly reason: VeronicaReuseRejectionReason; readonly rejectedCandidates: readonly VeronicaReuseRejectionReason[] };

export interface VeronicaCrossEpisodeReuseProvenance {
  readonly kind: "CROSS_EPISODE_SEMANTIC_REUSE";
  readonly targetEpisodeId: string;
  readonly targetSceneId: string;
  readonly sourceEpisodeId: string;
  readonly sourceSceneId: string;
  readonly assetId: string;
  readonly assetHash: string;
  readonly generationFingerprint: string;
  readonly semanticFingerprint: string;
  readonly compatibility: "EXACT_SEMANTIC_FINGERPRINT" | "EXACT_STRUCTURED_SEMANTICS";
  readonly materialization: "copy";
}

function normalize(value: string): string { return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US"); }
function semanticPayload(value: VeronicaReusableImageSemanticsV1): VeronicaReusableImageSemanticsV1 {
  return { ...value, visualIntent: normalize(value.visualIntent), semanticBeat: normalize(value.semanticBeat), settingArchetype: value.settingArchetype ? normalize(value.settingArchetype) : undefined, compositionArchetype: value.compositionArchetype ? normalize(value.compositionArchetype) : undefined, evidenceMode: value.evidenceMode ? normalize(value.evidenceMode) : undefined, aspectRatio: normalize(value.aspectRatio), visualContractVersion: normalize(value.visualContractVersion) };
}
function structuredPayload(value: VeronicaReusableImageSemanticsV1): object {
  return {
    subjectArchetypes: [...new Set(value.subjectArchetypes.map(normalize))].sort(), actions: [...new Set(value.actions.map(normalize))].sort(),
    settingArchetype: value.settingArchetype ? normalize(value.settingArchetype) : undefined,
    compositionArchetype: value.compositionArchetype ? normalize(value.compositionArchetype) : undefined,
    evidenceMode: value.evidenceMode ? normalize(value.evidenceMode) : undefined, aspectRatio: normalize(value.aspectRatio), visualContractVersion: normalize(value.visualContractVersion),
    containsVisibleText: value.containsVisibleText, containsEpisodeSpecificText: value.containsEpisodeSpecificText, containsNamedPerson: value.containsNamedPerson,
    containsNamedBrand: value.containsNamedBrand, usesReferenceImage: value.usesReferenceImage, localizationSensitive: value.localizationSensitive,
    continuitySensitive: value.continuitySensitive, identitySensitive: value.identitySensitive, uniqueEvidence: value.uniqueEvidence,
    uniqueProductIdentity: value.uniqueProductIdentity, materialEditingMask: value.materialEditingMask, occupationNeutral: value.occupationNeutral,
    occupationCues: [...new Set(value.occupationCues.map(normalize))].sort(), permittedOccupationCues: [...new Set(value.permittedOccupationCues.map(normalize))].sort(), reuseEligibility: value.reuseEligibility,
  };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function veronicaSemanticFingerprint(value: VeronicaReusableImageSemanticsV1): string { return hashText(`veronica-reusable-semantics-v1:${canonical(semanticPayload(value))}`); }

export function resolveVeronicaReusableImageRegistryPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".mediaforge", "veronica-reusable-images", "registry-v1.json");
}

export async function loadVeronicaReusableImageRegistry(registryPath: string): Promise<{ readonly assets: readonly VeronicaReusableImageDescriptorV1[]; readonly invalidEntries: number; readonly corrupt: boolean }> {
  let raw: unknown;
  try { raw = JSON.parse(await fs.readFile(registryPath, "utf8")) as unknown; } catch (error: unknown) {
    return { assets: [], invalidEntries: 0, corrupt: (error as NodeJS.ErrnoException).code !== "ENOENT" };
  }
  const envelope = registryEnvelopeSchema.safeParse(raw);
  if (!envelope.success) return { assets: [], invalidEntries: 0, corrupt: true };
  const parsed = envelope.data.assets.map((asset) => descriptorSchema.safeParse(asset));
  const assets = parsed.filter((item): item is z.ZodSafeParseSuccess<VeronicaReusableImageDescriptorV1> => item.success).map((item) => item.data).sort((a, b) => a.assetId.localeCompare(b.assetId));
  return { assets, invalidEntries: parsed.length - assets.length, corrupt: false };
}

export async function registerVeronicaReusableImage(args: { readonly registryPath: string; readonly workspaceRoot: string; readonly sourcePath: string; readonly descriptor: Omit<VeronicaReusableImageDescriptorV1, "schemaVersion" | "assetHash" | "relativePath" | "semanticFingerprint" | "reuseCount"> }): Promise<VeronicaReusableImageDescriptorV1 | undefined> {
  const { assetId: _assetId, sourceEpisodeId: _sourceEpisodeId, sourceSceneId: _sourceSceneId, generationFingerprint: _generationFingerprint, ...semanticsInput } = args.descriptor;
  const semantics = semanticsSchema.parse(semanticsInput);
  if (semantics.reuseEligibility !== "eligible" || hardGuard(semantics)) return undefined;
  const absoluteSource = path.resolve(args.sourcePath);
  const absoluteRoot = path.resolve(args.workspaceRoot);
  if (!isInside(absoluteRoot, absoluteSource) || !(await fileExists(absoluteSource))) return undefined;
  const descriptor = descriptorSchema.parse({ ...args.descriptor, ...semantics, schemaVersion: 1, assetHash: await hashFile(absoluteSource), relativePath: path.relative(absoluteRoot, absoluteSource), semanticFingerprint: veronicaSemanticFingerprint(semantics), reuseCount: 0 });
  const loaded = await loadVeronicaReusableImageRegistry(args.registryPath);
  const assets = [...loaded.assets.filter((asset) => asset.assetId !== descriptor.assetId), descriptor].sort((a, b) => a.assetId.localeCompare(b.assetId));
  await writeJsonAtomic(args.registryPath, { schemaVersion: 1, assets });
  return descriptor;
}

export async function findVeronicaCrossEpisodeReuse(args: { readonly registryPath: string; readonly workspaceRoot: string; readonly target: VeronicaReusableImageSemanticsV1 & { readonly episodeId: string; readonly sceneId: string; readonly sceneIndex: number }; readonly usedAssetIds: ReadonlySet<string>; readonly reusedSceneIndexes: readonly number[]; readonly crossEpisodeReuseCount: number; readonly policy?: Partial<VeronicaGeneratedImageReusePolicy>; readonly force?: boolean }): Promise<VeronicaReuseDecision> {
  const policy = { ...defaultVeronicaGeneratedImageReusePolicy, ...args.policy };
  if (args.force) return generate("FORCED");
  if (!policy.semanticCrossEpisodeReuse) return generate("DISABLED");
  const { episodeId: _episodeId, sceneId: _sceneId, sceneIndex: _sceneIndex, ...targetInput } = args.target;
  const target = semanticsSchema.parse(targetInput);
  if (target.reuseEligibility !== "eligible" || hardGuard(target)) return generate("TARGET_INELIGIBLE");
  if (args.crossEpisodeReuseCount >= policy.maxCrossEpisodeReusedAssetsPerEpisode) return generate("EPISODE_BUDGET_EXHAUSTED");
  const registry = await loadVeronicaReusableImageRegistry(args.registryPath);
  if (registry.corrupt) return generate("REGISTRY_INVALID");
  const targetFingerprint = veronicaSemanticFingerprint(target);
  const candidates: Array<{ asset: VeronicaReusableImageDescriptorV1; reason: "EXACT_SEMANTIC_FINGERPRINT" | "EXACT_STRUCTURED_SEMANTICS" }> = [];
  const rejected: VeronicaReuseRejectionReason[] = [];
  for (const asset of registry.assets) {
    if (asset.sourceEpisodeId === args.target.episodeId || args.usedAssetIds.has(asset.assetId) || (policy.forbidAdjacentReuse && args.reusedSceneIndexes.some((scene) => Math.abs(scene - args.target.sceneIndex) === 1))) { rejected.push("HARD_GUARD"); continue; }
    if (!compatible(asset, target) || !(await validAsset(args.workspaceRoot, asset))) { rejected.push("STALE_ASSET"); continue; }
    candidates.push({ asset, reason: asset.semanticFingerprint === targetFingerprint ? "EXACT_SEMANTIC_FINGERPRINT" : "EXACT_STRUCTURED_SEMANTICS" });
  }
  candidates.sort((a, b) => a.reason.localeCompare(b.reason) || a.asset.reuseCount - b.asset.reuseCount || a.asset.assetId.localeCompare(b.asset.assetId));
  const selected = candidates[0];
  return selected ? { kind: "reuse", asset: selected.asset, reason: selected.reason, rejectedCandidates: rejected } : generate(rejected.includes("STALE_ASSET") ? "STALE_ASSET" : "NO_COMPATIBLE_CANDIDATE", rejected);
}

export async function materializeVeronicaReusableImage(args: { readonly workspaceRoot: string; readonly asset: VeronicaReusableImageDescriptorV1; readonly targetPath: string; readonly targetEpisodeId: string; readonly targetSceneId: string; readonly compatibility: "EXACT_SEMANTIC_FINGERPRINT" | "EXACT_STRUCTURED_SEMANTICS" }): Promise<VeronicaCrossEpisodeReuseProvenance | undefined> {
  const source = resolveAssetPath(args.workspaceRoot, args.asset.relativePath);
  if (!source || !(await validAsset(args.workspaceRoot, args.asset))) return undefined;
  await fs.mkdir(path.dirname(args.targetPath), { recursive: true });
  await fs.copyFile(source, args.targetPath);
  if ((await hashFile(args.targetPath)) !== args.asset.assetHash) return undefined;
  return { kind: "CROSS_EPISODE_SEMANTIC_REUSE", targetEpisodeId: args.targetEpisodeId, targetSceneId: args.targetSceneId, sourceEpisodeId: args.asset.sourceEpisodeId, sourceSceneId: args.asset.sourceSceneId, assetId: args.asset.assetId, assetHash: args.asset.assetHash, generationFingerprint: args.asset.generationFingerprint, semanticFingerprint: args.asset.semanticFingerprint, compatibility: args.compatibility, materialization: "copy" };
}

export async function recordVeronicaReusableImageUse(registryPath: string, assetId: string): Promise<void> {
  const loaded = await loadVeronicaReusableImageRegistry(registryPath);
  if (loaded.corrupt) return;
  const assets = loaded.assets.map((asset) => asset.assetId === assetId ? { ...asset, reuseCount: asset.reuseCount + 1 } : asset);
  await writeJsonAtomic(registryPath, { schemaVersion: 1, assets });
}

function hardGuard(value: VeronicaReusableImageSemanticsV1): boolean { return value.containsVisibleText || value.containsEpisodeSpecificText || value.containsNamedPerson || value.containsNamedBrand || value.usesReferenceImage || value.localizationSensitive || value.continuitySensitive || value.identitySensitive || value.uniqueEvidence || value.uniqueProductIdentity || value.materialEditingMask || value.reuseEligibility !== "eligible"; }
function compatible(asset: VeronicaReusableImageDescriptorV1, target: VeronicaReusableImageSemanticsV1): boolean { return !hardGuard(asset) && !hardGuard(target) && normalize(asset.aspectRatio) === normalize(target.aspectRatio) && normalize(asset.visualContractVersion) === normalize(target.visualContractVersion) && (!target.occupationNeutral || asset.occupationCues.every((cue) => target.permittedOccupationCues.includes(cue))) && canonical(structuredPayload(asset)) === canonical(structuredPayload(target)); }
function generate(reason: VeronicaReuseRejectionReason, rejectedCandidates: readonly VeronicaReuseRejectionReason[] = []): VeronicaReuseDecision { return { kind: "generate", reason, rejectedCandidates }; }
function isInside(root: string, candidate: string): boolean { const relative = path.relative(root, candidate); return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative); }
function resolveAssetPath(root: string, relativePath: string): string | undefined { const absolute = path.resolve(root, relativePath); return isInside(path.resolve(root), absolute) ? absolute : undefined; }
async function validAsset(root: string, asset: VeronicaReusableImageDescriptorV1): Promise<boolean> { const absolute = resolveAssetPath(root, asset.relativePath); return Boolean(absolute && await fileExists(absolute) && await hashFile(absolute) === asset.assetHash); }
