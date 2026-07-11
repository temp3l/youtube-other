import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  fileExists,
  hashFile,
  renderCacheablePrompt,
  writeJsonAtomic,
  type CacheablePrompt,
} from "@mediaforge/shared";

export type ImageGenerationOperation =
  | "reference-image"
  | "scene-image"
  | "short-scene-image"
  | "thumbnail-image"
  | "image-edit"
  | "image-variation"
  | "image-repair";

export interface ImageGenerationIdentity {
  readonly operation: ImageGenerationOperation;
  readonly episodeNumber?: string | undefined;
  readonly language?: string | undefined;
  readonly format: "full" | "short" | "thumbnail" | "reference";
  readonly promptVersion: string;
  readonly visualBibleVersion: string;
  readonly schemaVersion: string;
  readonly validatorVersion: string;
  readonly model: string;
  readonly quality: string;
  readonly size: string;
  readonly aspectRatio?: string | undefined;
  readonly background?: string | undefined;
  readonly moderationMode?: string | undefined;
  readonly stablePromptHash: string;
  readonly dynamicPromptHash: string;
  readonly orderedReferenceHashes: readonly string[];
  readonly orderedReferenceRoles: readonly string[];
  readonly referenceDetailMode?: string | undefined;
  readonly inputFidelity?: string | undefined;
  readonly sourceScenePlanHash?: string | undefined;
  readonly sourceStoryHash?: string | undefined;
  readonly sourceImageHash?: string | undefined;
}

export interface ReferenceBundleIdentity {
  readonly orderedReferenceHashes: readonly string[];
  readonly referenceRoles: readonly string[];
  readonly detail: "low" | "high" | "auto";
  readonly inputFidelity: "high" | "default";
  readonly visualBibleVersion: string;
  readonly promptVersion: string;
}

export interface BatchDependencyNode {
  readonly id: string;
  readonly kind:
    | "story"
    | "short-story"
    | "localization"
    | "reference-image"
    | "scene-image"
    | "thumbnail-image"
    | "repair";
  readonly dependsOn: readonly string[];
}

export type DependencyNodeStatus =
  | "pending"
  | "completed"
  | "failed"
  | "blocked";

export interface CacheableSceneRequest {
  readonly id: string;
  readonly model: string;
  readonly operation: ImageGenerationOperation;
  readonly format: ImageGenerationIdentity["format"];
  readonly size: string;
  readonly aspectBucket: string;
  readonly promptFamily: string;
  readonly promptVersion: string;
  readonly referenceBundle: ReferenceBundleIdentity;
  readonly cacheShard: number;
}

export interface ProviderReferenceAsset {
  readonly logicalId: string;
  readonly localPath: string;
  readonly contentHash: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly providerFileId?: string | undefined;
  readonly uploadedAt?: string | undefined;
  readonly provider?: "openai" | undefined;
}

export interface ImageResultCacheEntry {
  readonly schemaVersion: "image-result-cache-v1";
  readonly identityHash: string;
  readonly identity: ImageGenerationIdentity;
  readonly artifactPath: string;
  readonly artifactHash: string;
  readonly validatedBy: string;
  readonly cachedAt: string;
}

export interface GeneratedImageRecord {
  readonly logicalId: string;
  readonly operation:
    | "reference-image"
    | "scene-image"
    | "thumbnail-image"
    | "image-edit"
    | "image-repair";
  readonly localPath: string;
  readonly contentHash: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: string;
  readonly model: string;
  readonly quality: string;
  readonly size: string;
  readonly promptVersion: string;
  readonly visualBibleVersion: string;
  readonly sourceImageHashes: readonly string[];
  readonly referenceImageHashes: readonly string[];
  readonly validationStatus: "VALID" | "INVALID";
}

export interface ProviderReferenceFileClient {
  uploadReferenceFile(args: {
    readonly localPath: string;
    readonly mimeType: string;
  }): Promise<{ readonly fileId: string }>;
  validateReferenceFile(fileId: string): Promise<boolean>;
}

const stableImageSceneContract = [
  "Create one production-ready cinematic image that follows the supplied visual bible.",
  "Preserve identity, wardrobe, age, proportions, materials, recurring objects, and location geometry from ordered references.",
  "Treat references as continuity evidence, not optional inspiration. Do not merge identities or invent replacement subjects.",
  "Use coherent perspective, physically plausible lighting, controlled contrast, readable silhouettes, and deliberate composition.",
  "Do not add captions, labels, logos, watermarks, borders, interface chrome, or unrequested written text.",
  "Keep unaffected reference attributes unchanged. The scene block below owns action, camera, lighting, and moment-specific changes.",
].join("\n");

export function buildCacheableImageScenePrompt(args: {
  readonly visualRules?: string;
  readonly referenceRoles: readonly string[];
  readonly scenePrompt: string;
}): CacheablePrompt {
  return renderCacheablePrompt({
    stableBlocks: [
      {
        id: "visual-contract",
        content: args.visualRules?.trim() || stableImageSceneContract,
      },
      {
        id: "reference-bundle",
        content:
          args.referenceRoles.length === 0
            ? "No input references. Preserve the project visual contract."
            : args.referenceRoles
                .map((role, index) => `Reference ${index + 1}: ${role}`)
                .join("\n"),
      },
    ],
    dynamicBlocks: [{ id: "scene-request", content: args.scenePrompt }],
  });
}

export function buildCacheableImageRepairPrompt(args: {
  readonly referenceRoles: readonly string[];
  readonly findings: readonly { readonly code: string; readonly requestedChange: string }[];
  readonly preserve: readonly string[];
}): CacheablePrompt {
  return renderCacheablePrompt({
    stableBlocks: [
      { id: "repair-contract", content: stableImageSceneContract },
      {
        id: "reference-bundle",
        content: args.referenceRoles
          .map((role, index) => `Reference ${index + 1}: ${role}`)
          .join("\n"),
      },
    ],
    dynamicBlocks: [
      {
        id: "repair-findings",
        content: args.findings
          .map((finding) => `${finding.code}: ${finding.requestedChange}`)
          .join("\n"),
      },
      { id: "preserve", content: args.preserve.join("\n") },
    ],
  });
}

export type ImageResultCacheDecision =
  | { readonly state: "hit"; readonly entry: ImageResultCacheEntry }
  | { readonly state: "stale" | "invalid" | "miss" | "forced"; readonly reason: string };

const providerReferenceAssetSchema = z.object({
  logicalId: z.string().min(1),
  localPath: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  mimeType: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  providerFileId: z.string().min(1).optional(),
  uploadedAt: z.string().min(1).optional(),
  provider: z.literal("openai").optional(),
});

const imageGenerationIdentitySchema: z.ZodType<ImageGenerationIdentity> = z.object({
  operation: z.enum([
    "reference-image",
    "scene-image",
    "short-scene-image",
    "thumbnail-image",
    "image-edit",
    "image-variation",
    "image-repair",
  ]),
  episodeNumber: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  format: z.enum(["full", "short", "thumbnail", "reference"]),
  promptVersion: z.string().min(1),
  visualBibleVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  validatorVersion: z.string().min(1),
  model: z.string().min(1),
  quality: z.string().min(1),
  size: z.string().min(1),
  aspectRatio: z.string().min(1).optional(),
  background: z.string().min(1).optional(),
  moderationMode: z.string().min(1).optional(),
  stablePromptHash: z.string().min(1),
  dynamicPromptHash: z.string().min(1),
  orderedReferenceHashes: z.array(z.string().min(1)),
  orderedReferenceRoles: z.array(z.string().min(1)),
  referenceDetailMode: z.string().min(1).optional(),
  inputFidelity: z.string().min(1).optional(),
  sourceScenePlanHash: z.string().min(1).optional(),
  sourceStoryHash: z.string().min(1).optional(),
  sourceImageHash: z.string().min(1).optional(),
});

const imageResultCacheEntrySchema: z.ZodType<ImageResultCacheEntry> = z.object({
  schemaVersion: z.literal("image-result-cache-v1"),
  identityHash: z.string().regex(/^[a-f0-9]{64}$/u),
  identity: imageGenerationIdentitySchema,
  artifactPath: z.string().min(1),
  artifactHash: z.string().regex(/^[a-f0-9]{64}$/u),
  validatedBy: z.string().min(1),
  cachedAt: z.string().min(1),
});

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

export function stableIdentityHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

export function referenceBundleHash(bundle: ReferenceBundleIdentity): string {
  if (bundle.orderedReferenceHashes.length !== bundle.referenceRoles.length) {
    throw new Error("Reference hashes and roles must have identical lengths.");
  }
  return stableIdentityHash(bundle);
}

export function imageGenerationIdentityHash(
  identity: ImageGenerationIdentity
): string {
  if (
    identity.orderedReferenceHashes.length !== identity.orderedReferenceRoles.length
  ) {
    throw new Error("Image identity reference hashes and roles must align.");
  }
  return stableIdentityHash(identity);
}

export async function readImageResultCache(args: {
  readonly cachePath: string;
  readonly identity: ImageGenerationIdentity;
  readonly force?: boolean;
  readonly revalidate?: boolean;
  readonly validateArtifact?: (entry: ImageResultCacheEntry) => Promise<boolean>;
}): Promise<ImageResultCacheDecision> {
  if (args.force) return { state: "forced", reason: "Forced regeneration requested." };
  let entry: ImageResultCacheEntry;
  try {
    entry = imageResultCacheEntrySchema.parse(
      JSON.parse(await fs.readFile(args.cachePath, "utf8")) as unknown
    );
  } catch (error) {
    if ((error as { readonly code?: string }).code === "ENOENT") {
      return { state: "miss", reason: "No cache entry exists." };
    }
    return { state: "invalid", reason: "Cache entry is malformed or corrupted." };
  }
  if (entry.identityHash !== imageGenerationIdentityHash(args.identity)) {
    return { state: "stale", reason: "Generation identity changed." };
  }
  if (!(await fileExists(entry.artifactPath))) {
    return { state: "invalid", reason: "Cached artifact is missing." };
  }
  if ((await hashFile(entry.artifactPath)) !== entry.artifactHash) {
    return { state: "invalid", reason: "Cached artifact hash does not match." };
  }
  if ((args.revalidate || args.validateArtifact) && args.validateArtifact) {
    try {
      if (!(await args.validateArtifact(entry))) {
        return { state: "invalid", reason: "Cached artifact failed revalidation." };
      }
    } catch {
      return { state: "invalid", reason: "Cached artifact failed revalidation." };
    }
  }
  return { state: "hit", entry };
}

export async function writeImageResultCache(args: {
  readonly cachePath: string;
  readonly identity: ImageGenerationIdentity;
  readonly artifactPath: string;
  readonly validatedBy: string;
}): Promise<ImageResultCacheEntry> {
  if (!(await fileExists(args.artifactPath))) {
    throw new Error(`Cannot cache missing image artifact: ${args.artifactPath}`);
  }
  const entry: ImageResultCacheEntry = {
    schemaVersion: "image-result-cache-v1",
    identityHash: imageGenerationIdentityHash(args.identity),
    identity: args.identity,
    artifactPath: args.artifactPath,
    artifactHash: await hashFile(args.artifactPath),
    validatedBy: args.validatedBy,
    cachedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(args.cachePath), { recursive: true });
  await writeJsonAtomic(args.cachePath, entry);
  return entry;
}

export function groupCacheableSceneRequests(
  requests: readonly CacheableSceneRequest[]
): ReadonlyMap<string, readonly CacheableSceneRequest[]> {
  const grouped = new Map<string, CacheableSceneRequest[]>();
  for (const request of requests) {
    const key = stableIdentityHash({
      model: request.model,
      operation: request.operation,
      format: request.format,
      size: request.size,
      aspectBucket: request.aspectBucket,
      promptFamily: request.promptFamily,
      promptVersion: request.promptVersion,
      referenceBundleHash: referenceBundleHash(request.referenceBundle),
      cacheShard: request.cacheShard,
    });
    grouped.set(key, [...(grouped.get(key) ?? []), request]);
  }
  return new Map(
    [...grouped.entries()]
      .map(([key, items]) => [
        key,
        [...items].sort((left, right) => left.id.localeCompare(right.id)),
      ] as const)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

export function resolveDependencyPlan(args: {
  readonly nodes: readonly BatchDependencyNode[];
  readonly statuses: Readonly<Record<string, DependencyNodeStatus>>;
}): {
  readonly ready: readonly BatchDependencyNode[];
  readonly blocked: readonly { readonly node: BatchDependencyNode; readonly by: readonly string[] }[];
} {
  const nodesById = new Map(args.nodes.map((node) => [node.id, node]));
  if (nodesById.size !== args.nodes.length) throw new Error("Dependency node ids must be unique.");
  const ready: BatchDependencyNode[] = [];
  const blocked: Array<{ node: BatchDependencyNode; by: readonly string[] }> = [];
  for (const node of [...args.nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    if (args.statuses[node.id] === "completed") continue;
    const unknown = node.dependsOn.filter((id) => !nodesById.has(id));
    if (unknown.length > 0) throw new Error(`Unknown dependencies for ${node.id}: ${unknown.join(", ")}`);
    const unresolved = node.dependsOn.filter((id) => args.statuses[id] !== "completed");
    if (unresolved.length === 0) ready.push(node);
    else blocked.push({ node, by: unresolved });
  }
  return { ready, blocked };
}

export function routeImageRepair(findings: {
  readonly mechanicalOnly: boolean;
  readonly wrongSubject: boolean;
  readonly wrongComposition: boolean;
  readonly continuityMismatch: boolean;
  readonly attempt: number;
  readonly maxAttempts: number;
}): "deterministic-fix" | "targeted-repair" | "regenerate" | "blocked" | "accept" {
  if (findings.attempt >= findings.maxAttempts) return "blocked";
  if (findings.mechanicalOnly) return "deterministic-fix";
  if (findings.wrongSubject || findings.wrongComposition) return "regenerate";
  if (findings.continuityMismatch) return "targeted-repair";
  return "accept";
}

export async function readProviderReferenceRegistry(
  registryPath: string
): Promise<readonly ProviderReferenceAsset[]> {
  try {
    const raw = JSON.parse(await fs.readFile(registryPath, "utf8")) as unknown;
    return z.array(providerReferenceAssetSchema).parse(raw);
  } catch (error) {
    if ((error as { readonly code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

export async function registerProviderReferenceAsset(args: {
  readonly registryPath: string;
  readonly asset: ProviderReferenceAsset;
}): Promise<readonly ProviderReferenceAsset[]> {
  const asset = providerReferenceAssetSchema.parse(args.asset);
  if (!(await fileExists(asset.localPath))) {
    throw new Error(`Reference image does not exist: ${asset.localPath}`);
  }
  if ((await hashFile(asset.localPath)) !== asset.contentHash) {
    throw new Error(`Reference image hash mismatch: ${asset.localPath}`);
  }
  const current = await readProviderReferenceRegistry(args.registryPath);
  const reusable = current.find(
    (entry) =>
      entry.provider === asset.provider &&
      entry.contentHash === asset.contentHash &&
      entry.providerFileId !== undefined
  );
  const nextAsset = reusable?.providerFileId && !asset.providerFileId
    ? { ...asset, providerFileId: reusable.providerFileId, uploadedAt: reusable.uploadedAt }
    : asset;
  const next = [
    ...current.filter(
      (entry) => !(entry.logicalId === nextAsset.logicalId && entry.provider === nextAsset.provider)
    ),
    nextAsset,
  ].sort((left, right) => left.logicalId.localeCompare(right.logicalId));
  await fs.mkdir(path.dirname(args.registryPath), { recursive: true });
  await writeJsonAtomic(args.registryPath, next);
  return next;
}

export async function ensureProviderReferenceAsset(args: {
  readonly registryPath: string;
  readonly asset: Omit<ProviderReferenceAsset, "providerFileId" | "uploadedAt" | "provider">;
  readonly client: ProviderReferenceFileClient;
  readonly now?: () => Date;
}): Promise<ProviderReferenceAsset> {
  const current = await readProviderReferenceRegistry(args.registryPath);
  const reusable = current.find(
    (entry) =>
      entry.provider === "openai" &&
      entry.contentHash === args.asset.contentHash &&
      entry.providerFileId !== undefined
  );
  if (
    reusable?.providerFileId &&
    (await args.client.validateReferenceFile(reusable.providerFileId))
  ) {
    const registered = await registerProviderReferenceAsset({
      registryPath: args.registryPath,
      asset: {
        ...args.asset,
        provider: "openai",
        providerFileId: reusable.providerFileId,
        ...(reusable.uploadedAt ? { uploadedAt: reusable.uploadedAt } : {}),
      },
    });
    return registered.find((entry) => entry.logicalId === args.asset.logicalId)!;
  }
  const uploaded = await args.client.uploadReferenceFile({
    localPath: args.asset.localPath,
    mimeType: args.asset.mimeType,
  });
  const next: ProviderReferenceAsset = {
    ...args.asset,
    provider: "openai",
    providerFileId: uploaded.fileId,
    uploadedAt: (args.now ?? (() => new Date()))().toISOString(),
  };
  const registered = await registerProviderReferenceAsset({
    registryPath: args.registryPath,
    asset: next,
  });
  return registered.find((entry) => entry.logicalId === args.asset.logicalId)!;
}
